import { prisma } from "@/server/db/prisma";
import { getCrmSetting } from "@/server/modules/settings/crmSettingsService";
import { writeAudit } from "@/server/services/auditService";
import {
  computeRiskScore,
  RISK_ENGINE_VERSION,
  type RiskFactorRates,
  type RiskResult,
} from "@/server/modules/risk/riskDefinitions";
import type { Prisma } from "@prisma/client";

// جلب عوامل المخاطر وكتابة النتيجة — طبقة نقل فقط: لا حساب هنا إطلاقًا
// (الحساب الحتمي في riskDefinitions.ts حصرًا، نفس نمط metrics/definitions.ts).
//
// isTest مستثنى صراحةً في كل استعلام (قيد القاعدة يمنع ربطها بعميل أصلًا،
// والفلتر يثبت العزم على مستوى الاستعلام لا على مستوى النية).
// بلا N+1: استعلامان لكل عميل مهما بلغ عدد طلباته.

const PRODUCTION_ORDERS: Prisma.OrderWhereInput = { isTest: false };

/** نسبة مئوية آمنة — مقام صفر يعطي 0 (لا قسمة على صفر، ولا NaN يتسرب للحساب). */
function ratePercent(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.min(100, (numerator / denominator) * 100);
}

/** العوامل الستة من بيانات الإنتاج فقط — كل عامل نسبة 0..100. */
export async function collectRiskFactors(customerId: string): Promise<RiskFactorRates> {
  const [orders, attempts] = await Promise.all([
    prisma.order.findMany({
      where: { customerId, ...PRODUCTION_ORDERS },
      select: { status: true, deliveredAt: true, returnedAt: true, commune: true },
    }),
    prisma.confirmationAttempt.findMany({
      where: { customerId, order: PRODUCTION_ORDERS },
      select: { outcome: true },
    }),
  ]);

  const total = orders.length;
  const delivered = orders.filter((o) => o.deliveredAt !== null).length;
  const refused = orders.filter((o) => o.status === "return_to_origin").length;
  const returned = orders.filter((o) => o.returnedAt !== null).length;
  const cancelled = orders.filter((o) => o.status === "cancelled").length;
  const duplicates = orders.filter((o) => o.status === "duplicate").length;
  const noAnswer = attempts.filter((a) => a.outcome === "no_answer").length;
  // تباين العنوان: كل بلدية إضافية بعد الأولى مؤشر تضارب — 0 لعميل ببلدية واحدة
  const communes = new Set(orders.map((o) => o.commune).filter(Boolean));
  const extraCommunes = Math.max(0, communes.size - 1);

  return {
    refusalRate: ratePercent(refused, total),
    returnRate: ratePercent(returned, delivered),
    cancellationRate: ratePercent(cancelled, total),
    noAnswerRate: ratePercent(noAnswer, attempts.length),
    duplicateOrders: ratePercent(duplicates, total),
    addressInconsistency: ratePercent(extraCommunes, total),
  };
}

/** إعادة حساب مخاطر عميل وكتابتها — موثّقة، وحتمية، وقابلة لإعادة التشغيل بلا أثر مزدوج
 * (نفس المدخلات تكتب نفس القيم؛ الكتابة upsert على نفس الصف لا إلحاق). */
export async function recomputeCustomerRisk(
  customerId: string,
  actorId?: string | null,
): Promise<RiskResult> {
  const [customer, weights, thresholds, factors] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, riskScore: true, riskLevel: true },
    }),
    getCrmSetting("risk_weights"),
    getCrmSetting("risk_thresholds"),
    collectRiskFactors(customerId),
  ]);
  if (!customer) throw new Error(`عميل غير موجود: ${customerId}`);

  // يرمي RiskConfigError عند أي إعداد ناقص/تالف — لا كتابة عندها إطلاقًا
  const result = computeRiskScore({ factors, weights, thresholds });

  await prisma.customer.update({
    where: { id: customerId },
    data: {
      riskScore: result.score,
      riskLevel: result.level,
      riskFactors: result.factors as unknown as Prisma.InputJsonValue,
      riskCalculatedAt: new Date(),
      riskEngineVersion: result.engineVersion,
    },
  });

  // توثيق كل تحوّل في تصنيف المخاطر — قبل/بعد يكفيان للمراجعة دون ضجيج لكل عميل
  if (customer.riskScore !== result.score || customer.riskLevel !== result.level) {
    await writeAudit({
      actorType: actorId ? "admin" : "system",
      actorId: actorId ?? null,
      action: "customer_risk_recomputed",
      entityType: "customer",
      entityId: customerId,
      before: { score: customer.riskScore, level: customer.riskLevel },
      after: { score: result.score, level: result.level, engineVersion: RISK_ENGINE_VERSION },
    });
  }

  return result;
}
