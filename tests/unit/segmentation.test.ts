import { describe, expect, it } from "vitest";
import { SegmentKind } from "@prisma/client";
import { decideSegments, pickPrimarySegment } from "@/server/modules/customers/segmentationService";

// عتبات الاختبار = نفس الافتراضيات الرسمية في crmSettingsSchema (لا أرقام مخترعة).
const T = {
  vip_min_orders: 3,
  vip_min_delivery_rate_percent: 80,
  vip_min_revenue_dzd: 30000,
  loyal_min_orders: 2,
  inactive_days: 90,
  profitable_min_margin_percent: 15,
};

const NOW = new Date("2026-09-05T12:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

function decide(over: Partial<Parameters<typeof decideSegments>[0]> = {}) {
  return decideSegments({
    ordersCount: 0,
    recognizedOrdersCount: 0,
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
