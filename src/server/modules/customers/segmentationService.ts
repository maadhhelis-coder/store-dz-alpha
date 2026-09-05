import { prisma } from "@/server/db/prisma";
import { SegmentKind } from "@prisma/client";
import { getCrmSetting } from "@/server/modules/settings/crmSettingsService";
import { crmSettingSchemas } from "@/lib/validation/crmSettingsSchema";
import type { z } from "zod";
import { getCustomerMetrics } from "@/server/modules/customers/customerMetricsService";

// ===========================================================================
// Customer Segmentation — عضوية متعددة + قطاع أساسي واحد كحد أقصى
// ===========================================================================
// القواعد كلها من crm_settings.segmentation_thresholds حصرًا — ممنوع عتبة
// مكتوبة في الكود. الأرقام المالية تأتي من getCustomerMetrics (أي من
// metrics/definitions.ts) — ممنوع أي حساب مالي هنا، وإلا انحرفت الأرقام عن
// Customer 360 وهو بالضبط ما تمنعه طبقة التعريفات.
//
// isTest مستثنى ضمنيًا: getCustomerMetrics يفلتره، والعملاء لا يُنشأون من
// طلبات isTest أصلًا (قيد قاعدة بيانات).
//
// at_risk و high_rto مطبَّقان بعتبات رسمية في crmSettingsSchema
// (at_risk_days، high_rto_min_delivered_orders، high_rto_rate_percent) — لا رقم
// منها مكتوب هنا. at_risk نافذة إنذار تسبق الخمول حصرًا فلا يتداخل القطاعان.

/** أولوية القطاع الأساسي — حتمية: الخطر أولًا، ثم القيمة، ثم دورة الحياة. */
const PRIMARY_PRIORITY: readonly SegmentKind[] = [
  SegmentKind.high_risk,
  SegmentKind.high_rto,
  SegmentKind.vip,
  SegmentKind.unprofitable,
  SegmentKind.profitable,
  SegmentKind.loyal,
  SegmentKind.repeat_customer,
  SegmentKind.inactive,
  SegmentKind.at_risk,
  SegmentKind.new_customer,
];

/** شكل العتبات من الـschema نفسه — مصدر واحد، فلا يمكن أن ينحرف الكود عن
 * crm_settings عند إضافة مفتاح أو تغيير نوعه. */
export type SegmentationThresholds = z.infer<
  (typeof crmSettingSchemas)["segmentation_thresholds"]
>;

const RULE_VERSION = 1;

const DAY_MS = 24 * 60 * 60 * 1000;

/** القطاعات المستحقة لعميل واحد — دالة قرار صرفة، قابلة للاختبار بلا قاعدة بيانات. */
export function decideSegments(input: {
  ordersCount: number;
  recognizedOrdersCount: number;
  returnedOrdersCount: number;
  netRecognizedRevenueDzd: number;
  grossProfitClvDzd: number;
  netProfitClvDzd: number;
  lastOrderAt: Date | null;
  riskLevel: string;
  now: Date;
  thresholds: SegmentationThresholds;
}): SegmentKind[] {
  const t = input.thresholds;
  const segments = new Set<SegmentKind>();

  // نسبة التسليم على الطلبات غير المستبعدة — 0 عند غياب الطلبات (لا قسمة على صفر)
  const deliveryRate =
    input.ordersCount > 0 ? (input.recognizedOrdersCount / input.ordersCount) * 100 : 0;

  if (
    input.ordersCount >= t.vip_min_orders &&
    deliveryRate >= t.vip_min_delivery_rate_percent &&
    input.netRecognizedRevenueDzd >= t.vip_min_revenue_dzd
  ) {
    segments.add(SegmentKind.vip);
  }

  if (input.ordersCount >= t.loyal_min_orders) segments.add(SegmentKind.loyal);
  if (input.ordersCount >= 2) segments.add(SegmentKind.repeat_customer);
  if (input.ordersCount <= 1) segments.add(SegmentKind.new_customer);

  if (input.lastOrderAt !== null) {
    const sinceLastOrderMs = input.now.getTime() - input.lastOrderAt.getTime();
    if (sinceLastOrderMs >= t.inactive_days * DAY_MS) {
      segments.add(SegmentKind.inactive);
    } else if (sinceLastOrderMs >= t.at_risk_days * DAY_MS) {
      // نافذة الإنذار فقط — الخمول يبتلعها (الـrefine في الـschema يضمن التعاقب)
      segments.add(SegmentKind.at_risk);
    }
  }

  // المرتجع بعد التسليم — نفس عدّادات metrics/definitions.ts بلا إعادة حساب،
  // وبحد أدنى للعيّنة كي لا يصنّف طلب واحد مرتجع عميلًا كامل السجل
  if (input.recognizedOrdersCount >= t.high_rto_min_delivered_orders) {
    const rtoRate = (input.returnedOrdersCount / input.recognizedOrdersCount) * 100;
    if (rtoRate >= t.high_rto_rate_percent) segments.add(SegmentKind.high_rto);
  }

  // هامش الربح على الإيراد المعترف به فقط — بلا إيراد معترف به لا حكم ربحية
  if (input.netRecognizedRevenueDzd > 0) {
    const marginPercent = (input.grossProfitClvDzd / input.netRecognizedRevenueDzd) * 100;
    if (marginPercent >= t.profitable_min_margin_percent) segments.add(SegmentKind.profitable);
  }
  if (input.netProfitClvDzd < 0) segments.add(SegmentKind.unprofitable);

  if (input.riskLevel === "high" || input.riskLevel === "very_high") {
    segments.add(SegmentKind.high_risk);
  }

  return [...segments];
}

/** القطاع الأساسي الوحيد (0..1) — أول مطابق في سلّم الأولوية الحتمي. */
export function pickPrimarySegment(segments: SegmentKind[]): SegmentKind | null {
  return PRIMARY_PRIORITY.find((candidate) => segments.includes(candidate)) ?? null;
}

/** إعادة حساب قطاعات عميل وكتابتها ذريًا. تُستدعى بعد الأحداث المؤثرة (دمج،
 * تغيّر حالة طلب) — والمسح الليلي لاحقًا حسب الخطة. */
export async function recomputeCustomerSegments(customerId: string): Promise<SegmentKind[]> {
  const [customer, metrics, thresholds] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, lastOrderAt: true, riskLevel: true },
    }),
    getCustomerMetrics(customerId),
    getCrmSetting("segmentation_thresholds"),
  ]);
  if (!customer) return [];

  const segments = decideSegments({
    ordersCount: metrics.ordersCount,
    recognizedOrdersCount: metrics.recognizedOrdersCount,
    returnedOrdersCount: metrics.returnedOrdersCount,
    netRecognizedRevenueDzd: metrics.netRecognizedRevenueDzd,
    grossProfitClvDzd: metrics.grossProfitClvDzd,
    netProfitClvDzd: metrics.netProfitClvDzd,
    lastOrderAt: customer.lastOrderAt,
    riskLevel: customer.riskLevel,
    now: new Date(),
    thresholds,
  });
  const primary = pickPrimarySegment(segments);
  const computedAt = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.customerSegment.deleteMany({
      where: { customerId, segment: { notIn: segments } },
    });
    // تصفير isPrimary أولًا في عبارة منفصلة — القيد الجزئي (أساسي واحد لكل عميل)
    // يُفحص لكل عبارة، فترتيب "صفّر ثم عيّن" يمنع تعارضًا لحظيًا عند تبدّل الأساسي.
    await tx.customerSegment.updateMany({
      where: { customerId, isPrimary: true },
      data: { isPrimary: false },
    });
    for (const segment of segments) {
      await tx.customerSegment.upsert({
        where: { customerId_segment: { customerId, segment } },
        create: {
          customerId,
          segment,
          isPrimary: segment === primary,
          computedAt,
          ruleVersion: RULE_VERSION,
        },
        update: {
          isPrimary: segment === primary,
          computedAt,
          ruleVersion: RULE_VERSION,
        },
      });
    }
  });

  return segments;
}
