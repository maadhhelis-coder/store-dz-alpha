import { describe, expect, it } from "vitest";
import {
  computeCustomerMetrics,
  isRevenueDisqualified,
  REVENUE_DISQUALIFIED_STATUSES,
  METRIC_BASIS_LABELS,
  type OrderFinancialSnapshot,
} from "@/server/modules/metrics/definitions";

// التعريفات المالية الرسمية — دالة صرفة بلا قاعدة بيانات. أي تغيير في أساس
// الاعتراف (delivered) أو في CLV يجب أن يكسر هذه الاختبارات، لا أن يمر بصمت.

function order(overrides: Partial<OrderFinancialSnapshot> = {}): OrderFinancialSnapshot {
  return {
    id: overrides.id ?? "o1",
    status: "pending",
    totalDzd: 10_000,
    deliveryPriceDzd: 0,
    packagingCostDzd: 0,
    otherCostDzd: 0,
    deliveredAt: null,
    returnedAt: null,
    codCollectedAt: null,
    codCollectedAmountDzd: null,
    itemsCostDzd: 0,
    unknownCostItems: 0,
    ...overrides,
  };
}

describe("computeCustomerMetrics — أساس الاعتراف", () => {
  it("لا اعتراف قبل التسليم مهما كانت الحالة", () => {
    const m = computeCustomerMetrics({
      orders: [order({ status: "shipped" }), order({ id: "o2", status: "confirmed" })],
      returnCosts: [],
    });
    expect(m.orderedRevenueDzd).toBe(20_000);
    expect(m.deliveredRevenueDzd).toBe(0);
    expect(m.grossRecognizedRevenueDzd).toBe(0);
    expect(m.revenueClvDzd).toBe(0);
    expect(m.recognizedOrdersCount).toBe(0);
  });

  it("deliveredAt وحده يفتح الاعتراف — لا الحالة النصية", () => {
    const m = computeCustomerMetrics({
      orders: [order({ status: "shipped", deliveredAt: new Date() })],
      returnCosts: [],
    });
    expect(m.deliveredRevenueDzd).toBe(10_000);
    expect(m.recognizedOrdersCount).toBe(1);
  });

  it("كل حالة مستبعدة تخرج من الأنبوب كله (لا عدّ ولا Ordered)", () => {
    for (const status of REVENUE_DISQUALIFIED_STATUSES) {
      const m = computeCustomerMetrics({ orders: [order({ status })], returnCosts: [] });
      expect(isRevenueDisqualified(status)).toBe(true);
      expect(m.ordersCount).toBe(0);
      expect(m.orderedRevenueDzd).toBe(0);
    }
  });

  it("المحصَّل: المبلغ الفعلي عند وجوده، وإلا إجمالي الطلب — وصفر بلا تحصيل", () => {
    const m = computeCustomerMetrics({
      orders: [
        order({ deliveredAt: new Date(), codCollectedAt: new Date(), codCollectedAmountDzd: 9_500 }),
        order({ id: "o2", deliveredAt: new Date(), codCollectedAt: new Date() }),
        order({ id: "o3", deliveredAt: new Date() }),
      ],
      returnCosts: [],
    });
    expect(m.collectedRevenueDzd).toBe(19_500);
    expect(m.deliveredRevenueDzd).toBe(30_000);
  });

  it("المرتجع بعد التسليم يُخصم؛ المرتجع بلا تسليم لا يُحتسب إطلاقًا", () => {
    const delivered = computeCustomerMetrics({
      orders: [order({ deliveredAt: new Date(), returnedAt: new Date() })],
      returnCosts: [],
    });
    expect(delivered.returnedDeductionDzd).toBe(10_000);
    expect(delivered.netRecognizedRevenueDzd).toBe(0);
    expect(delivered.returnedOrdersCount).toBe(1);

    const neverDelivered = computeCustomerMetrics({
      orders: [order({ returnedAt: new Date() })],
      returnCosts: [],
    });
    expect(neverDelivered.returnedDeductionDzd).toBe(0);
    expect(neverDelivered.returnedOrdersCount).toBe(0);
  });

  it("CLV الثلاثي: صافي → إجمالي الربح → صافي الربح بعد شحن الإرجاع", () => {
    const m = computeCustomerMetrics({
      orders: [
        order({
          deliveredAt: new Date(),
          totalDzd: 20_000,
          deliveryPriceDzd: 800,
          packagingCostDzd: 200,
          otherCostDzd: 500,
          itemsCostDzd: 8_500,
        }),
      ],
      returnCosts: [{ returnShippingCostDzd: 1_000 }, { returnShippingCostDzd: null }],
    });
    expect(m.revenueClvDzd).toBe(20_000);
    expect(m.costsOnRecognizedDzd).toBe(10_000);
    expect(m.grossProfitClvDzd).toBe(10_000);
    expect(m.returnShippingCostsDzd).toBe(1_000);
    expect(m.netProfitClvDzd).toBe(9_000);
  });

  it("تكاليف الطلبات غير المُسلَّمة لا تُخصم من الربح (تُحتسب مع الاعتراف فقط)", () => {
    const m = computeCustomerMetrics({
      orders: [order({ deliveryPriceDzd: 5_000, itemsCostDzd: 5_000 })],
      returnCosts: [],
    });
    expect(m.costsOnRecognizedDzd).toBe(0);
    expect(m.grossProfitClvDzd).toBe(0);
  });

  it("ربح سالب يبقى سالبًا (لا تصفير تجميلي)", () => {
    const m = computeCustomerMetrics({
      orders: [order({ deliveredAt: new Date(), totalDzd: 1_000, itemsCostDzd: 4_000 })],
      returnCosts: [],
    });
    expect(m.grossProfitClvDzd).toBe(-3_000);
  });

  it("التكلفة غير المعلومة تُرفع كعدّاد ولا تُخمَّن كصفر بصمت", () => {
    const m = computeCustomerMetrics({
      orders: [order({ deliveredAt: new Date(), unknownCostItems: 3 })],
      returnCosts: [],
    });
    expect(m.ordersWithUnknownItemCost).toBe(3);
    expect(m.grossProfitClvDzd).toBe(10_000);
  });

  it("بلا طلبات: أصفار حتمية بلا قسمة على صفر", () => {
    const m = computeCustomerMetrics({ orders: [], returnCosts: [] });
    expect(Object.values(m).every((v) => v === 0)).toBe(true);
  });

  it("لكل رقم معروض أساس معلن — مفاتيح METRIC_BASIS_LABELS كلها موجودة في الناتج", () => {
    const m = computeCustomerMetrics({ orders: [], returnCosts: [] });
    for (const key of Object.keys(METRIC_BASIS_LABELS)) {
      expect(m).toHaveProperty(key);
      expect(METRIC_BASIS_LABELS[key as keyof typeof METRIC_BASIS_LABELS].length).toBeGreaterThan(0);
    }
  });

  it("حتمي: نفس المدخلات بأي ترتيب تعطي نفس النتيجة", () => {
    const orders = [
      order({ id: "a", deliveredAt: new Date(), totalDzd: 3_000 }),
      order({ id: "b", status: "cancelled" }),
      order({ id: "c", deliveredAt: new Date(), returnedAt: new Date(), totalDzd: 2_000 }),
    ];
    const forward = computeCustomerMetrics({ orders, returnCosts: [] });
    const reversed = computeCustomerMetrics({ orders: [...orders].reverse(), returnCosts: [] });
    expect(reversed).toEqual(forward);
  });
});
