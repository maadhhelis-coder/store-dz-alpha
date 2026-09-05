import { describe, expect, it } from "vitest";
import {
  computeRiskScore,
  levelForScore,
  RiskConfigError,
  RISK_FACTOR_KEYS,
  RISK_ENGINE_VERSION,
  type RiskFactorRates,
} from "@/server/modules/risk/riskDefinitions";
import { parseCrmSettingValue } from "@/lib/validation/crmSettingsSchema";

// الأوزان والعتبات = الافتراضيات الرسمية مقروءة من الـschema مباشرة — لا رقم
// منسوخ يدويًا، فأي تغيير في الإعدادات الرسمية يظهر هنا فورًا.
const W = parseCrmSettingValue("risk_weights", undefined);
const T = parseCrmSettingValue("risk_thresholds", undefined);
const WEIGHT_SUM = RISK_FACTOR_KEYS.reduce((sum, key) => sum + W[key], 0);

const ZERO: RiskFactorRates = {
  refusalRate: 0,
  returnRate: 0,
  cancellationRate: 0,
  noAnswerRate: 0,
  duplicateOrders: 0,
  addressInconsistency: 0,
};

const score = (factors: Partial<RiskFactorRates>, over: { weights?: typeof W; thresholds?: typeof T } = {}) =>
  computeRiskScore({
    factors: { ...ZERO, ...factors },
    weights: over.weights ?? W,
    thresholds: over.thresholds ?? T,
  });

describe("computeRiskScore — المدى والحتمية", () => {
  it("كل العوامل صفر ⇒ score = 0 ومستوى low", () => {
    const r = score({});
    expect(r.score).toBe(0);
    expect(r.level).toBe("low");
    expect(r.engineVersion).toBe(RISK_ENGINE_VERSION);
  });

  it("كل العوامل 100 ⇒ score = 100 ومستوى very_high", () => {
    const r = computeRiskScore({
      factors: Object.fromEntries(RISK_FACTOR_KEYS.map((k) => [k, 100])) as RiskFactorRates,
      weights: W,
      thresholds: T,
    });
    expect(r.score).toBe(100);
    expect(r.level).toBe("very_high");
  });

  it("كل وزن منفردًا: عامل واحد بـ100 يعطي حصته من المجموع بالضبط", () => {
    for (const key of RISK_FACTOR_KEYS) {
      const expected = Math.round((100 * W[key]) / WEIGHT_SUM);
      expect(score({ [key]: 100 }).score, `العامل ${key}`).toBe(expected);
    }
  });

  it("مجموع المساهمات يساوي الدرجة (تفسير الحساب متسق)", () => {
    const r = score({ refusalRate: 60, returnRate: 40, cancellationRate: 20 });
    const sum = r.factors.reduce((acc, f) => acc + f.contribution, 0);
    expect(Math.round(sum)).toBe(r.score);
  });

  it("حتمي: نفس المدخلات تعطي نفس المخرجات بالضبط", () => {
    const input = { refusalRate: 33, noAnswerRate: 71, duplicateOrders: 12 };
    expect(score(input)).toEqual(score(input));
  });

  it("ترتيب العوامل ثابت مهما كان ترتيب مفاتيح المدخل", () => {
    const a = computeRiskScore({ factors: { ...ZERO }, weights: W, thresholds: T });
    const reordered = Object.fromEntries(
      [...RISK_FACTOR_KEYS].reverse().map((k) => [k, 0]),
    ) as RiskFactorRates;
    const b = computeRiskScore({ factors: reordered, weights: W, thresholds: T });
    expect(b.factors.map((f) => f.key)).toEqual(a.factors.map((f) => f.key));
  });
});

describe("levelForScore — الحدود 30/55/75 بالضبط وقبلها بنقطة", () => {
  const t = { medium: T.medium, high: T.high, veryHigh: T.very_high };

  it("الحد نفسه ينتمي للمستوى الأعلى", () => {
    expect(levelForScore(T.medium, t)).toBe("medium");
    expect(levelForScore(T.high, t)).toBe("high");
    expect(levelForScore(T.very_high, t)).toBe("very_high");
  });

  it("قبل كل حد بنقطة واحدة يبقى في المستوى الأدنى", () => {
    expect(levelForScore(T.medium - 1, t)).toBe("low");
    expect(levelForScore(T.high - 1, t)).toBe("medium");
    expect(levelForScore(T.very_high - 1, t)).toBe("high");
  });

  it("الطرفان 0 و100", () => {
    expect(levelForScore(0, t)).toBe("low");
    expect(levelForScore(100, t)).toBe("very_high");
  });
});

describe("deny-by-default — إعدادات ناقصة أو تالفة", () => {
  it("مجموع أوزان صفري ⇒ فشل صريح لا قسمة على صفر", () => {
    const zeroWeights = Object.fromEntries(RISK_FACTOR_KEYS.map((k) => [k, 0])) as typeof W;
    expect(() => score({}, { weights: zeroWeights })).toThrow(RiskConfigError);
  });

  it("وزن مفقود أو غير رقمي ⇒ فشل صريح", () => {
    for (const bad of [{ ...W, refusalRate: undefined }, { ...W, returnRate: Number.NaN }, { ...W, noAnswerRate: -5 }]) {
      expect(() => score({}, { weights: bad as typeof W })).toThrow(RiskConfigError);
    }
  });

  it("عامل خارج المدى 0..100 أو غير رقمي ⇒ فشل صريح", () => {
    for (const bad of [{ refusalRate: 101 }, { refusalRate: -1 }, { refusalRate: Number.NaN }]) {
      expect(() => score(bad as Partial<RiskFactorRates>)).toThrow(RiskConfigError);
    }
  });

  it("عتبات غير متصاعدة ⇒ فشل صريح (تصنيف مستحيل)", () => {
    expect(() => score({}, { thresholds: { medium: 60, high: 55, very_high: 75 } })).toThrow(RiskConfigError);
    expect(() => score({}, { thresholds: { medium: 30, high: 80, very_high: 75 } })).toThrow(RiskConfigError);
  });

  it("إعدادات غائبة تمامًا ⇒ فشل صريح لا قيم مخترعة", () => {
    expect(() =>
      computeRiskScore({
        factors: ZERO,
        weights: undefined as unknown as typeof W,
        thresholds: T,
      }),
    ).toThrow(RiskConfigError);
  });
});
