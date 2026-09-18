// =====================================================================
// Metrics Definitions Layer — المصدر الرسمي الوحيد لتعريف الحسابات المالية
// =====================================================================
// يستخدمه: Customer 360، CLV، ولاحقًا Analytics / Profitability / ROAS (P5+).
// القاعدة المعمارية: ممنوع وجود حساب مالي أو تعريف metric خارج هذه الطبقة —
// أي صفحة تحتاج رقمًا ماليًا تستدعي نفس الدوال الحتمية هنا.
//
// دالة الحساب صرفة (pure) — نفس المدخلات تعطي نفس المخرجات دائمًا في كل
// المستهلكين، وقابلة للاختبار unit بلا قاعدة بيانات. جلب البيانات (وفيه
// استثناء isTest) في customerMetricsService — طبقة العرض لا تحسب شيئًا.
//
// ===================== Revenue Recognition (المعتمد) =====================
// أساس الاعتراف الرسمي: الإيراد لا يُعترف به عند pending/confirmed/preparing/
// ready_to_ship/shipped/in_transit — الاعتراف يبدأ عند delivered حصرًا
// (deliveredAt != null هو الدليل الحاسم — تُكتب مرة واحدة عبر آلة الحالات).
//
// التعريفات الستة المعتمدة (على مستوى مجموعة الطلبات):
// 1. Ordered Revenue        = Σ totalDzd للطلبات غير المستبعدة (قيمة الأنبوب)
// 2. Delivered Revenue      = Σ totalDzd للطلبات ذات deliveredAt != null
// 3. Collected Revenue      = Σ (codCollectedAmountDzd ?? totalDzd) حيث codCollectedAt != null
// 4. Gross Recognized Revenue = Delivered Revenue (نفس الأساس — الاعتراف يبدأ delivered)
// 5. Returned-Adjusted (خصم)  = Σ totalDzd للطلبات ذات returnedAt != null (يُخصم)
// 6. Net Recognized Revenue   = Gross Recognized − خصم المرتجعات
//
// ===================== CLV (أساس الاعتراف الرسمي نفسه) =====================
// Revenue CLV      = Net Recognized Revenue (عمر العميل كاملًا)
// Gross Profit CLV = Revenue CLV − COGS (كلفة البضاعة من لقطات unitCostDzd×quantity
//                    وقت الإنشاء فقط — ممنوع أسعار/تكاليف المنتجات الحالية في أي حساب تاريخي)
// Net Profit CLV   = Revenue CLV − كل التكاليف المخصَّصة: COGS + التوصيل (تقدير:
//                    deliveryPriceDzd كبديل موثّق لكلفة الناقل حين لا كلفة فعلية) +
//                    التغليف + أخرى + شحن الإرجاع (returnShippingCostDzd)
//                    + صافي التعديلات المالية (credit − debit) على طلبات العميل.
// (P6 وحّد التعريف مع محرك الربحية finance/profitability.ts — نفس المكوّنات.)
//
// قرار توثيقي: unitCostDzd null (طلبات قديمة/منتجات بلا تكلفة) تُحسب 0 —
// محسوم ومعروض في التعريف، ويُرفع "طلبات بتكلفة غير معلومة" كعداد منفصل
// كي لا يضلّل الغياب أرباحًا دون علم.

export type RevenueDisqualifiedStatus =
  | "cancelled"
  | "fake"
  | "duplicate"
  | "wrong_number"
  | "fraud_suspected";

/** الحالات المستبعدة من الأنبوب كله — لا إيراد مرتب ولا قيمة أصلًا (قرار نهائي). */
export const REVENUE_DISQUALIFIED_STATUSES: readonly RevenueDisqualifiedStatus[] = [
  "cancelled",
  "fake",
  "duplicate",
  "wrong_number",
  "fraud_suspected",
];

export function isRevenueDisqualified(status: string): boolean {
  return (REVENUE_DISQUALIFIED_STATUSES as readonly string[]).includes(status);
}

/** لقطة مالية حتمية لطلب واحد — من أعمدة snapshot فقط (لا join للمنتجات الحالية). */
export type OrderFinancialSnapshot = {
  id: string;
  status: string;
  totalDzd: number;
  deliveryPriceDzd: number;
  packagingCostDzd: number;
  otherCostDzd: number;
  deliveredAt: Date | null;
  returnedAt: Date | null;
  codCollectedAt: Date | null;
  codCollectedAmountDzd: number | null;
  /** كلفة البضاعة من اللقطات — تُحسب في طبقة الجلب: Σ quantity×unitCostDzd (null→0) */
  itemsCostDzd: number;
  /** عدد بنود الطلب ذات تكلفة غير معلومة (unitCostDzd null) — للشفافية */
  unknownCostItems: number;
};

/** تكلفة إرجاع واحدة مكتملة — من ReturnRecord (قراءة فقط). */
export type ReturnCostSnapshot = {
  returnShippingCostDzd: number | null;
};

/** تعديل مالي غير قابل للتغيير — credit يزيد الربح، debit ينقصه. */
export type AdjustmentSnapshot = {
  amountDzd: number;
  direction: "credit" | "debit";
};

/** صافي التعديلات = Σ credit − Σ debit (أعداد صحيحة دج فقط). */
export function sumAdjustments(adjustments: readonly AdjustmentSnapshot[]): number {
  let net = 0;
  for (const a of adjustments) net += a.direction === "credit" ? a.amountDzd : -a.amountDzd;
  return net;
}

export type CustomerMetrics = {
  ordersCount: number;
  orderedRevenueDzd: number;
  deliveredRevenueDzd: number;
  collectedRevenueDzd: number;
  grossRecognizedRevenueDzd: number;
  returnedDeductionDzd: number;
  netRecognizedRevenueDzd: number;
  revenueClvDzd: number;
  grossProfitClvDzd: number;
  netProfitClvDzd: number;
  // شفافية الحساب — تُعرض في 360 تحت الأرقام
  costsOnRecognizedDzd: number;
  cogsOnRecognizedDzd: number;
  adjustmentsNetDzd: number;
  returnShippingCostsDzd: number;
  ordersWithUnknownItemCost: number;
  recognizedOrdersCount: number;
  returnedOrdersCount: number;
};

/** الحساب الحتمي الموحّد — كل مستهلك في النظام يمر من هنا حصرًا. */
export function computeCustomerMetrics(input: {
  orders: OrderFinancialSnapshot[];
  returnCosts: ReturnCostSnapshot[];
  adjustments?: AdjustmentSnapshot[];
}): CustomerMetrics {
  const { orders, returnCosts } = input;
  const adjustmentsNet = sumAdjustments(input.adjustments ?? []);

  let orderedRevenue = 0;
  let deliveredRevenue = 0;
  let collectedRevenue = 0;
  let returnedDeduction = 0;
  let costsOnRecognized = 0;
  let cogsOnRecognized = 0;
  let ordersWithUnknownItemCost = 0;
  let recognizedOrdersCount = 0;
  let returnedOrdersCount = 0;
  let ordersCount = 0;

  for (const order of orders) {
    if (isRevenueDisqualified(order.status)) continue; // خارج الأنبوب كله
    ordersCount++;
    orderedRevenue += order.totalDzd;

    if (order.deliveredAt !== null) {
      recognizedOrdersCount++;
      deliveredRevenue += order.totalDzd;
      collectedRevenue +=
        order.codCollectedAt !== null ? (order.codCollectedAmountDzd ?? order.totalDzd) : 0;
      costsOnRecognized +=
        order.deliveryPriceDzd + order.packagingCostDzd + order.otherCostDzd + order.itemsCostDzd;
      cogsOnRecognized += order.itemsCostDzd;
      ordersWithUnknownItemCost += order.unknownCostItems;
      if (order.returnedAt !== null) {
        returnedOrdersCount++;
        returnedDeduction += order.totalDzd;
      }
    }
  }

  const grossRecognized = deliveredRevenue;
  const netRecognized = grossRecognized - returnedDeduction;
  const returnShippingCosts = returnCosts.reduce(
    (sum, r) => sum + (r.returnShippingCostDzd ?? 0),
    0,
  );

  return {
    ordersCount,
    orderedRevenueDzd: orderedRevenue,
    deliveredRevenueDzd: deliveredRevenue,
    collectedRevenueDzd: collectedRevenue,
    grossRecognizedRevenueDzd: grossRecognized,
    returnedDeductionDzd: returnedDeduction,
    netRecognizedRevenueDzd: netRecognized,
    revenueClvDzd: netRecognized,
    grossProfitClvDzd: netRecognized - cogsOnRecognized,
    netProfitClvDzd: netRecognized - costsOnRecognized - returnShippingCosts + adjustmentsNet,
    costsOnRecognizedDzd: costsOnRecognized,
    cogsOnRecognizedDzd: cogsOnRecognized,
    adjustmentsNetDzd: adjustmentsNet,
    returnShippingCostsDzd: returnShippingCosts,
    ordersWithUnknownItemCost,
    recognizedOrdersCount,
    returnedOrdersCount,
  };
}

/** تسميات عربية رسمية لأساس كل رقم — تُعرض في الواجهة تحت كل KPI (مصدر وحيد). */
export const METRIC_BASIS_LABELS = {
  ordersCount: "عدد الطلبات غير المستبعدة",
  orderedRevenueDzd: "القيمة الإجمالية للطلبات غير المستبعدة (قبل الاعتراف)",
  deliveredRevenueDzd: "Σ إجمالي الطلبات المُسلَّمة (deliveredAt) — أساس الاعتراف",
  collectedRevenueDzd: "المحصَّل فعليًا COD (عند cod_collected)",
  grossRecognizedRevenueDzd: "الإيراد المعترف به إجمالًا — يبدأ عند delivered",
  returnedDeductionDzd: "خصم الطلبات المرتجعة بعد التسليم",
  netRecognizedRevenueDzd: "المعترف به بعد خصم المرتجعات",
  revenueClvDzd: "Revenue CLV = Net Recognized Revenue",
  grossProfitClvDzd: "Gross Profit CLV = الإيراد الصافي − كلفة البضاعة (لقطات unitCostDzd)",
  netProfitClvDzd:
    "Net Profit CLV = الإيراد الصافي − كل التكاليف (بضاعة + توصيل + تغليف + أخرى + شحن الإرجاع) + صافي التعديلات",
} as const;

// ===================== المعدلات التشغيلية (P6) =====================
// تعريف واحد لكل معدل — لوحات التحكم تستهلك هذه الدوال ولا تكتب صيغة خاصة بها.
// مقام صفر ⇒ null (لا 0% مضلِّل ولا NaN). كل المدخلات أعداد صحيحة.
//
// الأهلية (على طلبات isTest=false حصرًا — الاستثناء على مستوى الاستعلام):
// - المستبعد من الأنبوب (REVENUE_DISQUALIFIED_STATUSES): cancelled/fake/duplicate/
//   wrong_number/fraud_suspected — لا يدخل أي بسط أو مقام ما عدا "الإلغاء ÷ الكل".
// - shipped-eligible = كل طلب وصل الناقل (shipped وما بعدها: in_transit,
//   out_for_delivery, delivered, cod_collected, return_to_origin, returned).
// - delivered = deliveredAt != null (الدليل الحاسم، لا النص).
// - RTO = وصل الناقل ورجع بلا تسليم (return_to_origin أو returned مع deliveredAt null).
// - refused-returns = دورات إرجاع سببها refused وليست استبدالًا ولا مرفوضة.
// - delivery-attempted = shipped-eligible (كل شحنة خرجت حاولت التسليم).

/** الحالات التي وصلت الناقل فعلًا — مقام معدل التسليم ومعدل RTO. */
export const SHIPPED_ELIGIBLE_STATUSES: readonly string[] = [
  "shipped",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "cod_collected",
  "return_to_origin",
  "returned",
];

export function isShippedEligible(status: string): boolean {
  return SHIPPED_ELIGIBLE_STATUSES.includes(status);
}

/** RTO = وصل الناقل ورجع دون تسليم — returned بعد تسليم ليس RTO بل إرجاع. */
export function isRtoOrder(order: { status: string; deliveredAt: Date | null }): boolean {
  return (
    order.status === "return_to_origin" ||
    (order.status === "returned" && order.deliveredAt === null)
  );
}

/** نسبة مئوية بمنزلة عشرية واحدة، أو null عند مقام صفر. */
export function ratePercent(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

/** نسبة (x) بمنزلتين، أو null عند مقام صفر — لـROAS. */
export function ratio(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 100) / 100;
}

/** متوسط بالدج (عدد صحيح) أو null عند مقام صفر — لـAOV وCAC. */
export function averageDzd(totalDzd: number, count: number): number | null {
  if (count <= 0) return null;
  return Math.round(totalDzd / count);
}

export type OrderRateSnapshot = {
  status: string;
  deliveredAt: Date | null;
};

export type ReturnRateSnapshot = {
  reason: string;
  status: string;
  isExchange: boolean;
};

export type OperationalRates = {
  totalOrders: number;
  cancelledOrders: number;
  shippedEligibleOrders: number;
  deliveredOrders: number;
  rtoOrders: number;
  refusedReturns: number;
  deliveryRatePercent: number | null;
  refusalRatePercent: number | null;
  cancellationRatePercent: number | null;
  rtoRatePercent: number | null;
};

/** المعدلات التشغيلية الأربعة من لقطات الطلبات ودورات الإرجاع — دالة صرفة. */
export function computeOperationalRates(input: {
  orders: readonly OrderRateSnapshot[];
  returns: readonly ReturnRateSnapshot[];
}): OperationalRates {
  let totalOrders = 0;
  let cancelledOrders = 0;
  let shippedEligible = 0;
  let delivered = 0;
  let rto = 0;
  for (const o of input.orders) {
    totalOrders++;
    if (o.status === "cancelled") cancelledOrders++;
    if (isRevenueDisqualified(o.status)) continue;
    if (isShippedEligible(o.status)) shippedEligible++;
    if (o.deliveredAt !== null) delivered++;
    if (isRtoOrder(o)) rto++;
  }
  let refused = 0;
  for (const r of input.returns) {
    if (r.status === "rejected" || r.isExchange) continue;
    if (r.reason === "refused") refused++;
  }
  return {
    totalOrders,
    cancelledOrders,
    shippedEligibleOrders: shippedEligible,
    deliveredOrders: delivered,
    rtoOrders: rto,
    refusedReturns: refused,
    deliveryRatePercent: ratePercent(delivered, shippedEligible),
    refusalRatePercent: ratePercent(refused, shippedEligible),
    cancellationRatePercent: ratePercent(cancelledOrders, totalOrders),
    rtoRatePercent: ratePercent(rto, shippedEligible),
  };
}

export const RATE_BASIS_LABELS = {
  deliveryRatePercent: "المُسلَّم ÷ ما وصل الناقل (shipped وما بعدها)",
  refusalRatePercent: "دورات إرجاع بسبب الرفض (بلا استبدال) ÷ ما وصل الناقل",
  cancellationRatePercent: "الملغى ÷ كل الطلبات",
  rtoRatePercent: "رجع دون تسليم ÷ ما وصل الناقل",
  aovDzd: "الإيراد المعترف به ÷ الطلبات المعترف بها",
  roas: "الإيراد المعترف به للطلبات المعزوّة ÷ إنفاق الإعلانات المعزوّ",
  profitRoas: "صافي ربح الطلبات المعزوّة ÷ إنفاق الإعلانات المعزوّ",
  cacDzd: "إنفاق الاستحواذ المعزوّ ÷ العملاء الجدد المعزوّون (أول طلب معترف به)",
} as const;
