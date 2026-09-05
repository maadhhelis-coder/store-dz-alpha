import { describe, expect, it } from "vitest";
import { SegmentKind } from "@prisma/client";
import { decideSegments, pickPrimarySegment } from "@/server/modules/customers/segmentationService";
import { parseCrmSettingValue } from "@/lib/validation/crmSettingsSchema";

// عتبات الاختبار = الافتراضيات الرسمية نفسها مقروءة من الـschema مباشرة —
// لا رقم منسوخ يدويًا هنا، فإضافة مفتاح أو تغيير افتراضي لا يترك الاختبار متخلفًا.
const T = parseCrmSettingValue("segmentation_thresholds", undefined);

const NOW = new Date("2026-09-05T12:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

function decide(over: Partial<Parameters<typeof decideSegments>[0]> = {}) {
  return decideSegments({
    ordersCount: 0,
    recognizedOrdersCount: 0,
    returnedOrdersCount: 0,
    netRecognizedRevenueDzd: 0,
    grossProfitClvDzd: 0,
    netProfitClvDzd: 0,
    lastOrderAt: null,
    riskLevel: "low",
    now: NOW,
    thresholds: T,
    ...over,
  });
}

describe("decideSegments", () => {
  it("عميل جديد بلا طلبات", () => {
    expect(decide()).toContain(SegmentKind.new_customer);
  });

  it("VIP يتطلب الشروط الثلاثة معًا", () => {
    const vipInput = {
      ordersCount: 3,
      recognizedOrdersCount: 3,
      netRecognizedRevenueDzd: 30000,
    };
    expect(decide(vipInput)).toContain(SegmentKind.vip);
    // إيراد أقل من العتبة بدينار واحد ⇒ لا VIP
    expect(decide({ ...vipInput, netRecognizedRevenueDzd: 29999 })).not.toContain(SegmentKind.vip);
    // نسبة تسليم 2/3 = 66% < 80 ⇒ لا VIP
    expect(decide({ ...vipInput, recognizedOrdersCount: 2 })).not.toContain(SegmentKind.vip);
    // طلبان فقط ⇒ لا VIP
    expect(decide({ ...vipInput, ordersCount: 2 })).not.toContain(SegmentKind.vip);
  });

  it("عضوية متعددة: VIP + loyal + repeat + profitable معًا", () => {
    const segments = decide({
      ordersCount: 4,
      recognizedOrdersCount: 4,
      netRecognizedRevenueDzd: 40000,
      grossProfitClvDzd: 8000, // 20% ≥ 15
      netProfitClvDzd: 8000,
    });
    expect(segments).toEqual(
      expect.arrayContaining([
        SegmentKind.vip,
        SegmentKind.loyal,
        SegmentKind.repeat_customer,
        SegmentKind.profitable,
      ]),
    );
  });

  it("الخمول عند بلوغ العتبة تمامًا وليس قبلها", () => {
    expect(decide({ ordersCount: 1, lastOrderAt: daysAgo(90) })).toContain(SegmentKind.inactive);
    expect(decide({ ordersCount: 1, lastOrderAt: daysAgo(89) })).not.toContain(SegmentKind.inactive);
  });

  it("لا حكم ربحية بلا إيراد معترف به (لا قسمة على صفر)", () => {
    const segments = decide({ ordersCount: 2, grossProfitClvDzd: 5000 });
    expect(segments).not.toContain(SegmentKind.profitable);
  });

  it("الربح الصافي السالب ⇒ unprofitable", () => {
    expect(decide({ ordersCount: 2, netProfitClvDzd: -1 })).toContain(SegmentKind.unprofitable);
    expect(decide({ ordersCount: 2, netProfitClvDzd: 0 })).not.toContain(SegmentKind.unprofitable);
  });

  it("الخطر المرتفع/المرتفع جدًا فقط ⇒ high_risk", () => {
    expect(decide({ riskLevel: "high" })).toContain(SegmentKind.high_risk);
    expect(decide({ riskLevel: "very_high" })).toContain(SegmentKind.high_risk);
    expect(decide({ riskLevel: "medium" })).not.toContain(SegmentKind.high_risk);
  });

  it("حتمية: نفس المدخلات تعطي نفس المخرجات", () => {
    const input = { ordersCount: 4, recognizedOrdersCount: 4, netRecognizedRevenueDzd: 40000 };
    expect(decide(input)).toEqual(decide(input));
  });
});

describe("pickPrimarySegment", () => {
  it("الخطر يسبق القيمة", () => {
    expect(pickPrimarySegment([SegmentKind.vip, SegmentKind.high_risk])).toBe(SegmentKind.high_risk);
  });

  it("القيمة تسبق دورة الحياة", () => {
    expect(pickPrimarySegment([SegmentKind.repeat_customer, SegmentKind.vip])).toBe(SegmentKind.vip);
  });

  it("الترتيب في المدخل لا يغيّر النتيجة", () => {
    const a = pickPrimarySegment([SegmentKind.loyal, SegmentKind.unprofitable]);
    const b = pickPrimarySegment([SegmentKind.unprofitable, SegmentKind.loyal]);
    expect(a).toBe(b);
    expect(a).toBe(SegmentKind.unprofitable);
  });

  it("بلا قطاعات ⇒ لا أساسي (0..1)", () => {
    expect(pickPrimarySegment([])).toBeNull();
  });
});

// ===========================================================================
// at_risk و high_rto — كل عتبة من crm_settings، والحدود مُختبَرة على الحافة
// بالضبط (=) وقبلها بيوم/بنقطة واحدة، لأن الحد نفسه هو ما ينكسر بصمت.
// ===========================================================================

describe("at_risk — نافذة الإنذار قبل الخمول", () => {
  it("عند at_risk_days بالضبط ⇒ at_risk بلا inactive", () => {
    const s = decide({ ordersCount: 1, lastOrderAt: daysAgo(T.at_risk_days) });
    expect(s).toContain(SegmentKind.at_risk);
    expect(s).not.toContain(SegmentKind.inactive);
  });

  it("قبل الحد بيوم واحد ⇒ لا at_risk ولا inactive", () => {
    const s = decide({ ordersCount: 1, lastOrderAt: daysAgo(T.at_risk_days - 1) });
    expect(s).not.toContain(SegmentKind.at_risk);
    expect(s).not.toContain(SegmentKind.inactive);
  });

  it("عند inactive_days بالضبط ⇒ inactive يبتلع at_risk (لا تداخل)", () => {
    const s = decide({ ordersCount: 1, lastOrderAt: daysAgo(T.inactive_days) });
    expect(s).toContain(SegmentKind.inactive);
    expect(s).not.toContain(SegmentKind.at_risk);
  });

  it("قبل الخمول بيوم ⇒ at_risk وحده", () => {
    const s = decide({ ordersCount: 1, lastOrderAt: daysAgo(T.inactive_days - 1) });
    expect(s).toContain(SegmentKind.at_risk);
    expect(s).not.toContain(SegmentKind.inactive);
  });

  it("بلا أي طلب (lastOrderAt = null) ⇒ لا at_risk", () => {
    expect(decide({ lastOrderAt: null })).not.toContain(SegmentKind.at_risk);
  });
});

describe("high_rto — المرتجع بعد التسليم", () => {
  it("عند حد العيّنة والنسبة بالضبط ⇒ high_rto", () => {
    const delivered = T.high_rto_min_delivered_orders;
    const returned = Math.ceil((delivered * T.high_rto_rate_percent) / 100);
    const s = decide({
      ordersCount: delivered,
      recognizedOrdersCount: delivered,
      returnedOrdersCount: returned,
    });
    expect(s).toContain(SegmentKind.high_rto);
  });

  it("عيّنة أقل من الحد الأدنى ⇒ لا حكم مهما بلغت النسبة (100%)", () => {
    const delivered = T.high_rto_min_delivered_orders - 1;
    const s = decide({
      ordersCount: Math.max(delivered, 1),
      recognizedOrdersCount: delivered,
      returnedOrdersCount: delivered,
    });
    expect(s).not.toContain(SegmentKind.high_rto);
  });

  it("نسبة تحت العتبة ⇒ لا high_rto", () => {
    const s = decide({
      ordersCount: 10,
      recognizedOrdersCount: 10,
      returnedOrdersCount: 1, // 10% < 30%
    });
    expect(s).not.toContain(SegmentKind.high_rto);
  });

  it("بلا طلبات مُسلَّمة ⇒ لا قسمة على صفر ولا قطاع", () => {
    const s = decide({ ordersCount: 3, recognizedOrdersCount: 0, returnedOrdersCount: 0 });
    expect(s).not.toContain(SegmentKind.high_rto);
    expect(s.every((x) => typeof x === "string")).toBe(true);
  });

  it("حتمي: نفس المدخلات تعطي نفس القطاعات", () => {
    const input = { ordersCount: 5, recognizedOrdersCount: 5, returnedOrdersCount: 3 };
    expect(decide(input)).toEqual(decide(input));
  });

  it("high_rto يسبق القيمة في الأساسي، وinactive يسبق at_risk", () => {
    expect(pickPrimarySegment([SegmentKind.vip, SegmentKind.high_rto])).toBe(SegmentKind.high_rto);
    expect(pickPrimarySegment([SegmentKind.at_risk, SegmentKind.inactive])).toBe(
      SegmentKind.inactive,
    );
  });
});
