import { describe, expect, it } from "vitest";
import {
  aggregateProfit,
  allocateCreativeSpend,
  allocateLargestRemainder,
  computeOrderProfitLines,
  summarizeProfit,
  type ProfitOrderInput,
} from "@/server/modules/finance/profitability";
import {
  computeOperationalRates,
  ratePercent,
  ratio,
  averageDzd,
  sumAdjustments,
} from "@/server/modules/metrics/definitions";
import { resolveProfitWindow } from "@/lib/validation/financeSchema";

// محرك الربحية والمقاييس — دوال صرفة بلا قاعدة بيانات. أي تغيير في الصيغة أو في
// التخصيص أو في أساس أي معدل يجب أن يكسر هذه الاختبارات لا أن يمرّ بصمت.

function order(overrides: Partial<ProfitOrderInput> = {}): ProfitOrderInput {
  return {
    id: overrides.id ?? "o1",
    orderNumber: overrides.orderNumber ?? "SD-1",
    status: "delivered",
    createdAt: new Date("2026-09-10T10:00:00Z"),
    deliveredAt: new Date("2026-09-12T10:00:00Z"),
    returnedAt: null,
    itemsSubtotalDzd: 5_000,
    discountDzd: 500,
    deliveryPriceDzd: 600,
    totalDzd: 5_100,
    packagingCostDzd: 50,
    otherCostDzd: 20,
    wilayaCode: 16,
    wilayaName: "الجزائر",
    commune: "الحراش",
    platform: "facebook",
    creativeName: "creative-A",
    utmCampaign: "camp-1",
    campaignId: null,
    adSetId: "adset-1",
    adId: "ad-1",
    landingPath: "/p/x",
    customerId: "c1",
    customerMatchSource: "new_customer",
    items: [
      { id: "i1", productId: "p1", productName: "A", quantity: 2, unitPriceDzd: 2_000, unitCostDzd: 800, lineTotalDzd: 4_000 },
      { id: "i2", productId: "p2", productName: "B", quantity: 1, unitPriceDzd: 1_000, unitCostDzd: 300, lineTotalDzd: 1_000 },
    ],
    shipments: [{ provider: "dhd", shippingCostDzd: null, shippingCostProvenance: "unavailable" }],
    returns: [],
    adjustments: [],
    ...overrides,
  };
}

describe("allocateLargestRemainder", () => {
  it("مجموع الحصص = الأصل دائمًا، والبواقي الأكبر تأخذ الوحدات المتبقية", () => {
    const shares = allocateLargestRemainder(100, [1, 1, 1]);
    expect(shares).toEqual([34, 33, 33]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("حتمي: كسر التعادل بالفهرس الأصغر، وأوزان صفر كلها ⇒ لا توزيع", () => {
    expect(allocateLargestRemainder(7, [2, 2, 2])).toEqual([3, 2, 2]);
    expect(allocateLargestRemainder(7, [0, 0])).toEqual([0, 0]);
    expect(allocateLargestRemainder(0, [5, 5])).toEqual([0, 0]);
    expect(allocateLargestRemainder(10, [])).toEqual([]);
  });

  it("أعداد كبيرة بلا خطأ عائم (BigInt)", () => {
    const shares = allocateLargestRemainder(999_999_999, [123_456_789, 987_654_321, 1]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(999_999_999);
    expect(shares.every(Number.isInteger)).toBe(true);
  });

  it("يرفض غير الصحيح والسالب", () => {
    expect(() => allocateLargestRemainder(10.5, [1])).toThrow();
    expect(() => allocateLargestRemainder(10, [-1])).toThrow();
  });
});

describe("allocateCreativeSpend", () => {
  it("يوزّع الإنفاق بنسبة الإيراد المُسلَّم ولا يتجاوزه، ومرة واحدة لكل إبداع", () => {
    const res = allocateCreativeSpend(
      [
        { id: "a", creativeKey: "facebook::c", deliveredRevenueDzd: 3_000 },
        { id: "b", creativeKey: "facebook::c", deliveredRevenueDzd: 1_000 },
        { id: "z", creativeKey: "facebook::c", deliveredRevenueDzd: 0 }, // غير مُسلَّم — لا حصة
      ],
      [
        { platform: "facebook", creativeName: "c", spendDzd: 1_001 },
        { platform: "facebook", creativeName: "c", spendDzd: 1_001 }, // مكرَّر — يُتجاهل
      ],
    );
    expect(res.perOrder.get("a")).toBe(751);
    expect(res.perOrder.get("b")).toBe(250);
    expect(res.perOrder.has("z")).toBe(false);
    expect(res.allocatedSpendDzd).toBe(1_001);
    expect(res.unallocatedSpendDzd).toBe(0);
  });

  it("إبداع بإنفاق بلا إيراد مُسلَّم = غير قابل للتخصيص (لا تخمين)", () => {
    const res = allocateCreativeSpend([{ id: "a", creativeKey: "tiktok::x", deliveredRevenueDzd: 0 }], [
      { platform: "tiktok", creativeName: "x", spendDzd: 500 },
    ]);
    expect(res.perOrder.size).toBe(0);
    expect(res.unallocatedSpendDzd).toBe(500);
    expect(res.unallocatedCreatives).toEqual(["tiktok::x"]);
  });
});

describe("computeOrderProfitLines — الصيغة", () => {
  it("Net Profit = NetSales + Delivery − COGS − Carrier − RTO − Packaging − Ads − Other + Adjustments", () => {
    const { lines } = computeOrderProfitLines([order()], [{ platform: "facebook", creativeName: "creative-A", spendDzd: 400 }]);
    const l = lines[0];
    expect(l.netSalesDzd).toBe(4_500);
    expect(l.deliveryRevenueDzd).toBe(600);
    expect(l.cogsDzd).toBe(1_900);
    expect(l.carrierCostDzd).toBe(600);
    expect(l.carrierCostProvenance).toBe("estimated");
    expect(l.advertisingDzd).toBe(400);
    expect(l.advertisingProvenance).toBe("allocated");
    expect(l.netProfitDzd).toBe(4_500 + 600 - 1_900 - 600 - 0 - 50 - 400 - 20 + 0);
  });

  it("لا اعتراف قبل التسليم: الإيراد وCOGS صفر، لكن تكاليف الشحن تبقى إن وصل الناقل", () => {
    const { lines } = computeOrderProfitLines([order({ status: "shipped", deliveredAt: null })], []);
    expect(lines[0].netSalesDzd).toBe(0);
    expect(lines[0].cogsDzd).toBe(0);
    expect(lines[0].carrierCostDzd).toBe(600);
    expect(lines[0].packagingCostDzd).toBe(50);
    expect(lines[0].netProfitDzd).toBe(-670);
  });

  it("طلب لم يصل الناقل: لا كلفة ناقل (provenance=unavailable) ولا تغليف", () => {
    const { lines } = computeOrderProfitLines([order({ status: "confirmed", deliveredAt: null, shipments: [] })], []);
    expect(lines[0].carrierCostDzd).toBe(0);
    expect(lines[0].carrierCostProvenance).toBe("unavailable");
    expect(lines[0].packagingCostDzd).toBe(0);
  });

  it("كلفة الناقل الفعلية تُفضَّل على التقدير", () => {
    const { lines } = computeOrderProfitLines(
      [order({ shipments: [{ provider: "dhd", shippingCostDzd: 450, shippingCostProvenance: "actual" }] })],
      [],
    );
    expect(lines[0].carrierCostDzd).toBe(450);
    expect(lines[0].carrierCostProvenance).toBe("actual");
  });

  it("المرتجع بعد التسليم: الإيراد يسقط كليًا، وكلفة الإرجاع = شحن الدورات + بضاعة لم تُسترجَع", () => {
    const { lines } = computeOrderProfitLines(
      [
        order({
          status: "returned",
          returnedAt: new Date(),
          returns: [
            {
              status: "received",
              isExchange: false,
              reason: "refused",
              outboundShippingCostDzd: 300,
              returnShippingCostDzd: 200,
              items: [{ orderItemId: "i1", quantity: 2, restockedQuantity: 1 }], // وحدة تالفة × 800
            },
            {
              status: "rejected",
              isExchange: false,
              reason: "damaged",
              outboundShippingCostDzd: 999,
              returnShippingCostDzd: 999,
              items: [],
            },
          ],
        }),
      ],
      [],
    );
    expect(lines[0].returnedAfterDelivery).toBe(true);
    expect(lines[0].netSalesDzd).toBe(0);
    expect(lines[0].cogsDzd).toBe(0);
    expect(lines[0].rtoReturnCostDzd).toBe(300 + 200 + 800);
  });

  it("الحالات المستبعدة (ملغى/مزيف…) لا تدخل الأسطر أصلًا", () => {
    const { lines } = computeOrderProfitLines(
      [order({ status: "cancelled", deliveredAt: null }), order({ id: "o2", status: "fake", deliveredAt: null })],
      [],
    );
    expect(lines).toHaveLength(0);
  });

  it("التعديلات: credit يزيد الربح وdebit ينقصه", () => {
    const { lines } = computeOrderProfitLines(
      [order({ adjustments: [{ amountDzd: 100, direction: "credit" }, { amountDzd: 250, direction: "debit" }] })],
      [],
    );
    expect(lines[0].adjustmentsDzd).toBe(-150);
    expect(sumAdjustments([{ amountDzd: 100, direction: "credit" }, { amountDzd: 250, direction: "debit" }])).toBe(-150);
  });

  it("تكلفة غير معلومة تُعدّ 0 وتُرفع كعدّاد لا تُخمَّن", () => {
    const { lines } = computeOrderProfitLines(
      [
        order({
          items: [{ id: "i1", productId: "p1", productName: "A", quantity: 3, unitPriceDzd: 1_000, unitCostDzd: null, lineTotalDzd: 3_000 }],
        }),
      ],
      [],
    );
    expect(lines[0].cogsDzd).toBe(0);
    expect(lines[0].unknownCostItems).toBe(3);
  });

  it("عزو بلا إنفاق مسجَّل = unavailable؛ بلا عزو أصلًا = none", () => {
    const { lines } = computeOrderProfitLines([order(), order({ id: "o2", platform: null, creativeName: null })], []);
    expect(lines[0].advertisingProvenance).toBe("unavailable");
    expect(lines[1].advertisingProvenance).toBe("none");
  });

  it("البنود: مجموع الحصص الموزَّعة = الطلب حرفيًا (الخصم والتكاليف بنسبة lineTotal)", () => {
    const { lines } = computeOrderProfitLines([order({ adjustments: [{ amountDzd: 33, direction: "debit" }] })], [
      { platform: "facebook", creativeName: "creative-A", spendDzd: 401 },
    ]);
    const l = lines[0];
    const sum = (k: keyof (typeof l.items)[number]) => l.items.reduce((s, it) => s + Number(it[k]), 0);
    expect(sum("discountDzd")).toBe(l.discountDzd);
    expect(sum("netSalesDzd")).toBe(l.netSalesDzd);
    expect(sum("cogsDzd")).toBe(l.cogsDzd);
    expect(sum("advertisingDzd")).toBe(l.advertisingDzd);
    expect(sum("adjustmentsDzd")).toBe(l.adjustmentsDzd);
    expect(sum("netProfitDzd")).toBe(l.netProfitDzd);
    expect(l.items[0].discountDzd).toBe(400); // 4000/5000 × 500
    expect(l.items[1].discountDzd).toBe(100);
  });
});

describe("aggregateProfit + summarizeProfit", () => {
  const spends = [{ platform: "facebook", creativeName: "creative-A", spendDzd: 1_000 }];
  const orders = [
    order({ id: "a", orderNumber: "SD-A" }),
    order({
      id: "b",
      orderNumber: "SD-B",
      customerId: "c2",
      customerMatchSource: "primary_phone",
      wilayaCode: 31,
      wilayaName: "وهران",
      commune: "بئر الجير",
    }),
    order({ id: "c", orderNumber: "SD-C", status: "shipped", deliveredAt: null, platform: null, creativeName: null }),
  ];

  it("كل بُعد يجمع نفس الإجمالي (لا ازدواج ولا فقد)", () => {
    const { lines } = computeOrderProfitLines(orders, spends);
    const total = lines.reduce((s, l) => s + l.netProfitDzd, 0);
    const dims = [
      "order", "orderItem", "product", "customer", "creative", "campaign", "wilaya", "commune", "carrier", "date", "landingPage", "adSet", "ad",
    ] as const;
    for (const dim of dims) {
      const rows = aggregateProfit(lines, dim);
      expect(rows.reduce((s, r) => s + r.netProfitDzd, 0), dim).toBe(total);
    }
    expect(aggregateProfit(lines, "wilaya").map((r) => r.label).sort()).toEqual(["الجزائر", "وهران"]);
    expect(aggregateProfit(lines, "product").find((r) => r.key === "p1")?.orders).toBe(3);
  });

  it("الملخص: AOV وROAS وProfit ROAS وCAC من التعريفات الرسمية", () => {
    const { lines, allocation } = computeOrderProfitLines(orders, spends);
    const s = summarizeProfit(lines, allocation);
    expect(s.recognizedOrders).toBe(2);
    expect(s.aovDzd).toBe(5_100); // (4500+600)×2 ÷ 2
    expect(s.attributedSpendDzd).toBe(1_000);
    expect(s.attributedRevenueDzd).toBe(10_200);
    expect(s.roas).toBe(10.2);
    expect(s.acquiredCustomers).toBe(1); // c1 فقط new_customer
    expect(s.cacDzd).toBe(500); // نصف الإنفاق على طلب العميل الجديد
    expect(s.allocationMethod).toBe("largest_remainder_v1");
  });

  it("مقام صفر ⇒ null (لا 0 مضلِّل)", () => {
    const { lines, allocation } = computeOrderProfitLines([order({ status: "pending", deliveredAt: null, shipments: [] })], []);
    const s = summarizeProfit(lines, allocation);
    expect(s.aovDzd).toBeNull();
    expect(s.roas).toBeNull();
    expect(s.profitRoas).toBeNull();
    expect(s.cacDzd).toBeNull();
    expect(ratePercent(0, 0)).toBeNull();
    expect(ratio(5, 0)).toBeNull();
    expect(averageDzd(0, 0)).toBeNull();
  });
});

describe("computeOperationalRates", () => {
  it("التسليم/الرفض/الإلغاء/RTO بأساسها الموثّق", () => {
    const rates = computeOperationalRates({
      orders: [
        { status: "delivered", deliveredAt: new Date() },
        { status: "delivered", deliveredAt: new Date() },
        { status: "returned", deliveredAt: null }, // RTO
        { status: "return_to_origin", deliveredAt: null }, // RTO
        { status: "returned", deliveredAt: new Date() }, // إرجاع بعد تسليم — ليس RTO
        { status: "shipped", deliveredAt: null },
        { status: "cancelled", deliveredAt: null },
        { status: "fake", deliveredAt: null }, // خارج المقامات (إلا "الكل")
        { status: "pending", deliveredAt: null },
      ],
      returns: [
        { reason: "refused", status: "received", isExchange: false },
        { reason: "refused", status: "rejected", isExchange: false }, // مرفوضة — لا تُعدّ
        { reason: "refused", status: "received", isExchange: true }, // استبدال — لا يُعدّ رفضًا
        { reason: "damaged", status: "received", isExchange: false },
      ],
    });
    expect(rates.totalOrders).toBe(9);
    expect(rates.shippedEligibleOrders).toBe(6);
    expect(rates.deliveredOrders).toBe(3);
    expect(rates.rtoOrders).toBe(2);
    expect(rates.refusedReturns).toBe(1);
    expect(rates.deliveryRatePercent).toBe(50);
    expect(rates.rtoRatePercent).toBe(33.3);
    expect(rates.refusalRatePercent).toBe(16.7);
    expect(rates.cancellationRatePercent).toBe(11.1);
  });

  it("بلا طلبات: كل المعدلات null", () => {
    const rates = computeOperationalRates({ orders: [], returns: [] });
    expect(rates.deliveryRatePercent).toBeNull();
    expect(rates.refusalRatePercent).toBeNull();
    expect(rates.cancellationRatePercent).toBeNull();
    expect(rates.rtoRatePercent).toBeNull();
  });
});

describe("resolveProfitWindow — فترة عمل حتمية (UTC)", () => {
  const now = new Date("2026-09-18T15:30:00Z");
  it("today = بداية اليوم حتى الآن؛ 7d = 6 أيام كاملة + اليوم", () => {
    expect(resolveProfitWindow({ dimension: "date", range: "today" }, now)).toEqual({
      from: new Date("2026-09-18T00:00:00Z"),
      to: now,
    });
    expect(resolveProfitWindow({ dimension: "date", range: "7d" }, now).from).toEqual(new Date("2026-09-12T00:00:00Z"));
    expect(resolveProfitWindow({ dimension: "date", range: "30d" }, now).from).toEqual(new Date("2026-08-20T00:00:00Z"));
  });
});
