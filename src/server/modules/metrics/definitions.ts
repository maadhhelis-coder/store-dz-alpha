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
// Revenue CLV    = Net Recognized Revenue (عمر العميل كاملًا)
// Gross Profit CLV = Revenue CLV − التكاليف المباشرة للطلبات المعترف بها
//                    (delivery + packaging + other + كلفة البضاعة من لقطات
//                    unitCostDzd×quantity — لقطات وقت الإنشاء فقط، ممنوع
//                    الأسعار/التكاليف الحالية للمنتجات في أي حساب تاريخي)
// Net Profit CLV   = Gross Profit CLV − تكاليف شحن الإرجاع (returnShippingCostDzd)
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
  returnShippingCostsDzd: number;
  ordersWithUnknownItemCost: number;
  recognizedOrdersCount: number;
  returnedOrdersCount: number;
};

/** الحساب الحتمي الموحّد — كل مستهلك في النظام يمر من هنا حصرًا. */
export function computeCustomerMetrics(input: {
  orders: OrderFinancialSnapshot[];
  returnCosts: ReturnCostSnapshot[];
}): CustomerMetrics {
  const { orders, returnCosts } = input;

  let orderedRevenue = 0;
  let deliveredRevenue = 0;
  let collectedRevenue = 0;
  let returnedDeduction = 0;
  let costsOnRecognized = 0;
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
    grossProfitClvDzd: netRecognized - costsOnRecognized,
    netProfitClvDzd: netRecognized - costsOnRecognized - returnShippingCosts,
    costsOnRecognizedDzd: costsOnRecognized,
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
  grossProfitClvDzd: "الإيراد الصافي − تكاليف التسليم والتغليف وكلفة البضاعة (لقطات)",
  netProfitClvDzd: "ربح إجمالي − تكاليف شحن الإرجاع",
} as const;
