import { RiskLevel } from "@prisma/client";
import type { crmSettingSchemas } from "@/lib/validation/crmSettingsSchema";
import type { z } from "zod";

// ===========================================================================
// Risk Definitions — المصدر الرسمي الوحيد لحساب درجة المخاطر (P4)
// ===========================================================================
// دالة صرفة تمامًا: نفس المدخلات تعطي نفس المخرجات دائمًا، بلا قاعدة بيانات
// وبلا وقت وبلا عشوائية — أي مستهلك (خدمة، job، اختبار) يمر من هنا حصرًا.
//
// كل رقم تشغيلي (وزن أو عتبة) يأتي من crm_settings؛ لا رقم مكتوب هنا.
// الاستثناء الوحيد المسموح: مدى العوامل نفسه (0..100 نسبة مئوية) وهو تعريف
// رياضي للمقياس لا قيمة تشغيلية قابلة للضبط.
//
// deny-by-default: إعداد ناقص أو تالف أو مجموع أوزان صفري = رمي صريح
// (RiskConfigError) — ممنوع منطقيًا الرجوع لقيمة مخترعة أو حساب جزئي.

export const RISK_ENGINE_VERSION = "risk-v1";

/** العوامل الستة — مفاتيحها مطابقة حرفيًا لأوزان crm_settings.risk_weights. */
export const RISK_FACTOR_KEYS = [
  "refusalRate",
  "returnRate",
  "cancellationRate",
  "noAnswerRate",
  "duplicateOrders",
  "addressInconsistency",
] as const;

export type RiskFactorKey = (typeof RISK_FACTOR_KEYS)[number];

/** كل عامل نسبة مئوية 0..100 — التطبيع مسؤولية طبقة الجلب لا الحساب. */
export type RiskFactorRates = Record<RiskFactorKey, number>;

export type RiskWeights = z.infer<(typeof crmSettingSchemas)["risk_weights"]>;
export type RiskThresholds = z.infer<(typeof crmSettingSchemas)["risk_thresholds"]>;

/** أثر عامل واحد — يُحفظ في customers.risk_factors ليكون الحساب قابلًا للتفسير. */
export type RiskFactorBreakdown = {
  key: RiskFactorKey;
  ratePercent: number;
  weight: number;
  /** مساهمة العامل في الدرجة النهائية (rate × weight ÷ Σweights) */
  contribution: number;
};

export type RiskResult = {
  score: number;
  level: RiskLevel;
  factors: RiskFactorBreakdown[];
  engineVersion: string;
};

export class RiskConfigError extends Error {
  readonly code = "RISK_CONFIG_INVALID";

  constructor(message: string) {
    super(message);
    this.name = "RiskConfigError";
  }
}

function assertRate(value: unknown, key: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new RiskConfigError(`عامل مخاطر غير صالح (${key}): يجب أن يكون رقمًا بين 0 و100`);
  }
  return value;
}

function assertWeight(value: unknown, key: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new RiskConfigError(`وزن مخاطر غير صالح (${key}): يجب أن يكون رقمًا غير سالب`);
  }
  return value;
}

/** الحساب الحتمي الموحّد — كل مستهلك في النظام يمر من هنا حصرًا. */
export function computeRiskScore(input: {
  factors: RiskFactorRates;
  weights: RiskWeights;
  thresholds: RiskThresholds;
}): RiskResult {
  const { factors, weights, thresholds } = input;

  if (!factors || !weights || !thresholds) {
    throw new RiskConfigError("إعدادات المخاطر ناقصة — لا حساب بقيم افتراضية مخترعة");
  }

  // العتبات: ثلاث قيم صاعدة حتمًا وإلا فالتصنيف بلا معنى
  const medium = assertRate(thresholds.medium, "thresholds.medium");
  const high = assertRate(thresholds.high, "thresholds.high");
  const veryHigh = assertRate(thresholds.very_high, "thresholds.very_high");
  if (!(medium < high && high <= veryHigh)) {
    throw new RiskConfigError(
      `عتبات المخاطر غير متصاعدة (${medium}/${high}/${veryHigh}) — تصنيف مستحيل`,
    );
  }

  const breakdown: RiskFactorBreakdown[] = [];
  let weightSum = 0;
  let weighted = 0;

  // ترتيب ثابت من RISK_FACTOR_KEYS — لا اعتماد على ترتيب مفاتيح الكائن
  for (const key of RISK_FACTOR_KEYS) {
    const rate = assertRate(factors[key], `factors.${key}`);
    const weight = assertWeight(weights[key], `weights.${key}`);
    weightSum += weight;
    weighted += rate * weight;
    breakdown.push({ key, ratePercent: rate, weight, contribution: 0 });
  }

  // مجموع أوزان صفري = قسمة على صفر: فشل صريح بدل درجة صفر مضلِّلة
  if (weightSum <= 0) {
    throw new RiskConfigError("مجموع أوزان المخاطر صفر — لا يمكن حساب درجة ذات معنى");
  }

  for (const factor of breakdown) {
    factor.contribution = round2((factor.ratePercent * factor.weight) / weightSum);
  }

  // 0..100 بحكم البناء (متوسط مرجّح لقيم 0..100)؛ الحصر دفاعي ضد خطأ فاصلة عائمة
  const score = Math.min(100, Math.max(0, Math.round(weighted / weightSum)));

  return {
    score,
    level: levelForScore(score, { medium, high, veryHigh }),
    factors: breakdown,
    engineVersion: RISK_ENGINE_VERSION,
  };
}

/** التصنيف الحتمي — الحد نفسه ينتمي للمستوى الأعلى (>= وليس >). */
export function levelForScore(
  score: number,
  thresholds: { medium: number; high: number; veryHigh: number },
): RiskLevel {
  if (score >= thresholds.veryHigh) return RiskLevel.very_high;
  if (score >= thresholds.high) return RiskLevel.high;
  if (score >= thresholds.medium) return RiskLevel.medium;
  return RiskLevel.low;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
