import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import type { AnalyticsRange, DateWindow, MasterFilters } from "@/server/repositories/analyticsRepository";
import { getKpis, orderFiltersWhere, rangeToWindow } from "@/server/repositories/analyticsRepository";

const REVENUE_STATUSES = ["confirmed", "shipped", "delivered"] as const;

function pct(numerator: number, denominator: number): number {
  return denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : 0;
}

// نفس نمط allowlist الدفاعي فـanalyticsRepository — يمنع استعمال Prisma.raw بقيمة عمود
// غير متوقَّعة حتى لو أُضيف استدعاء جديد لاحقًا بالخطأ بقيمة ديناميكية.
const ALLOWED_DATE_COLUMNS = new Set([
  "created_at",
  "o.created_at",
  "delivered_at",
  "o.delivered_at",
  "returned_at",
  "confirmed_at",
  "cancelled_at",
]);

function dateFilterSql(window: DateWindow, column: string) {
  if (!ALLOWED_DATE_COLUMNS.has(column)) {
    throw new Error(`masterDashboardRepository.dateFilterSql: عمود غير مسموح به: ${column}`);
  }
  const parts: Prisma.Sql[] = [];
  if (window.start) parts.push(Prisma.sql`AND ${Prisma.raw(column)} >= ${window.start}`);
  if (window.end) parts.push(Prisma.sql`AND ${Prisma.raw(column)} < ${window.end}`);
  return parts.length ? Prisma.join(parts, " ") : Prisma.empty;
}

// ===== الربح الحقيقي (COD) =====
//
// الربح = (إجمالي بنود الطلب - الخصم) - تكلفة الوحدات (COGS)، على الطلبات المُسلَّمة فقط
// (delivered) — ربح الدفع عند الاستلام غير حقيقي قبل التسليم الفعلي. سعر التوصيل مُستبعَد
// عمدًا من الطرفين (يُدفع من الزبون ويُدفع لشركة التوصيل، والمبلغ الفعلي المدفوع لشركة
// التوصيل غير مُسجَّل بدقة كافية لإدراجه بأمانة). راجع Plan: هذا التعريف مكتوب صراحةً هنا
// وفـواجهة اللوحة، لا مخفيًا.
export type ProfitMetrics = {
  deliveredOrders: number;
  productRevenueDzd: number;
  knownCogsDzd: number;
  grossProfitDzd: number;
  profitPerDeliveredOrderDzd: number | null;
  // true إذا احتوى أي بند من بنود الطلبات المُسلَّمة على unitCostDzd فارغ (تكلفة غير
  // مضبوطة لذلك المنتج) — الربح المعروض حينها ناقص فعليًا، لا رقمًا خاطئًا صامتًا.
  hasIncompleteCostData: boolean;
  itemsMissingCost: number;
};

// عمود ولاية اختياري إضافي على استعلامات هذا الملف (عدا dateFilterSql الخاص بالتاريخ) —
// دائمًا Prisma.sql بقيمة مُعامَلة (parameterized)، لا تسلسل نصي خام، فلا حاجة لـallowlist.
function wilayaFilterSql(filters: MasterFilters | undefined, column: "o.wilaya_code" | "wilaya_code") {
  return filters?.wilayaCode ? Prisma.sql`AND ${Prisma.raw(column)} = ${filters.wilayaCode}` : Prisma.empty;
}

export async function getProfitMetrics(window: DateWindow, filters?: MasterFilters): Promise<ProfitMetrics> {
  // فلتر منتج نشط: الخصم مرتبط بالطلب كاملًا لا بند واحد، فلا يمكن توزيعه بأمانة على منتج
  // محدَّد وسط طلب متعدد المنتجات (مثلاً عرض إضافي Upsell) — نتحوّل هنا لحساب الإيراد على
  // مستوى البند نفسه (line_total_dzd لهذا المنتج فقط) بلا خصم الطلب، بدل احتساب اشتراك خاطئ
  // لإيراد منتجات أخرى ضمن نفس الطلب. موثَّق فـالواجهة عند تفعيل فلتر منتج.
  if (filters?.productSlug) {
    const dateFilter = dateFilterSql(window, "o.delivered_at");
    const wilayaFilter = wilayaFilterSql(filters, "o.wilaya_code");

    const [row] = await prisma.$queryRaw<
      { deliveredOrders: bigint; productRevenueDzd: bigint | null; knownCogsDzd: bigint | null; itemsMissingCost: bigint }[]
    >`
      SELECT COUNT(DISTINCT oi.order_id)::bigint AS "deliveredOrders",
             COALESCE(SUM(oi.line_total_dzd), 0)::bigint AS "productRevenueDzd",
             COALESCE(SUM(oi.unit_cost_dzd * oi.quantity), 0)::bigint AS "knownCogsDzd",
             COUNT(*) FILTER (WHERE oi.unit_cost_dzd IS NULL)::bigint AS "itemsMissingCost"
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.status = 'delivered' AND oi.product_slug_snapshot = ${filters.productSlug} ${dateFilter} ${wilayaFilter}
    `;

    const deliveredOrders = Number(row?.deliveredOrders ?? 0);
    const productRevenueDzd = Number(row?.productRevenueDzd ?? 0);
    const knownCogsDzd = Number(row?.knownCogsDzd ?? 0);
    const itemsMissingCost = Number(row?.itemsMissingCost ?? 0);
    const grossProfitDzd = productRevenueDzd - knownCogsDzd;

    return {
      deliveredOrders,
      productRevenueDzd,
      knownCogsDzd,
      grossProfitDzd,
      profitPerDeliveredOrderDzd: deliveredOrders > 0 ? Math.round(grossProfitDzd / deliveredOrders) : null,
      hasIncompleteCostData: itemsMissingCost > 0,
      itemsMissingCost,
    };
  }

  const orderDateFilter = dateFilterSql(window, "delivered_at");
  const itemDateFilter = dateFilterSql(window, "o.delivered_at");
  const orderWilayaFilter = wilayaFilterSql(filters, "wilaya_code");
  const itemWilayaFilter = wilayaFilterSql(filters, "o.wilaya_code");

  const [orderAgg, itemAgg] = await Promise.all([
    prisma.$queryRaw<{ deliveredOrders: bigint; productRevenueDzd: bigint | null }[]>`
      SELECT COUNT(*)::bigint AS "deliveredOrders",
             COALESCE(SUM(items_subtotal_dzd - discount_dzd), 0)::bigint AS "productRevenueDzd"
      FROM orders
      WHERE status = 'delivered' ${orderDateFilter} ${orderWilayaFilter}
    `,
    prisma.$queryRaw<{ knownCogsDzd: bigint | null; itemsMissingCost: bigint }[]>`
      SELECT COALESCE(SUM(oi.unit_cost_dzd * oi.quantity), 0)::bigint AS "knownCogsDzd",
             COUNT(*) FILTER (WHERE oi.unit_cost_dzd IS NULL)::bigint AS "itemsMissingCost"
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.status = 'delivered' ${itemDateFilter} ${itemWilayaFilter}
    `,
  ]);

  const deliveredOrders = Number(orderAgg[0]?.deliveredOrders ?? 0);
  const productRevenueDzd = Number(orderAgg[0]?.productRevenueDzd ?? 0);
  const knownCogsDzd = Number(itemAgg[0]?.knownCogsDzd ?? 0);
  const itemsMissingCost = Number(itemAgg[0]?.itemsMissingCost ?? 0);
  const grossProfitDzd = productRevenueDzd - knownCogsDzd;

  return {
    deliveredOrders,
    productRevenueDzd,
    knownCogsDzd,
    grossProfitDzd,
    profitPerDeliveredOrderDzd: deliveredOrders > 0 ? Math.round(grossProfitDzd / deliveredOrders) : null,
    hasIncompleteCostData: itemsMissingCost > 0,
    itemsMissingCost,
  };
}

// ===== معدل الإرجاع =====
//
// كل من "المُسلَّم" و"المُرجَع" يُعَدّان بحدث حقيقي حصل فعليًا خلال الفترة المختارة
// (deliveredAt/returnedAt) — لا بتاريخ إنشاء الطلب، الذي قد يسبق التسليم/الإرجاع بأيام.
export async function getReturnRate(
  window: DateWindow,
  filters?: MasterFilters,
): Promise<{ delivered: number; returned: number; rate: number }> {
  const filterWhere = orderFiltersWhere(filters);
  const [delivered, returned] = await Promise.all([
    prisma.order.count({ where: { status: "delivered", ...windowToWhere(window, "deliveredAt"), ...filterWhere } }),
    prisma.order.count({ where: { status: "returned", ...windowToWhere(window, "returnedAt"), ...filterWhere } }),
  ]);
  return { delivered, returned, rate: pct(returned, delivered + returned) };
}

// ===== معدل الإلغاء =====
//
// "طلبات قرَّرت مصيرها" (تأكيد أو إلغاء) خلال الفترة — confirmedAt يُصفَّر تلقائيًا لو أُلغي
// طلب كان مؤكَّدًا (راجع ordersRepository.confirmedAtUpdate)، فالمجموعتان متنافيتان فعليًا
// لا متداخلتَين.
export async function getCancellationRate(
  window: DateWindow,
  filters?: MasterFilters,
): Promise<{ confirmed: number; cancelled: number; rate: number }> {
  const filterWhere = orderFiltersWhere(filters);
  const [confirmed, cancelled] = await Promise.all([
    prisma.order.count({
      where: { confirmedAt: { not: null }, ...windowToWhere(window, "confirmedAt"), ...filterWhere },
    }),
    prisma.order.count({ where: { status: "cancelled", ...windowToWhere(window, "cancelledAt"), ...filterWhere } }),
  ]);
  return { confirmed, cancelled, rate: pct(cancelled, confirmed + cancelled) };
}

function windowToWhere(window: DateWindow, field: "deliveredAt" | "returnedAt" | "confirmedAt" | "cancelledAt") {
  if (!window.start && !window.end) return {};
  return {
    [field]: {
      ...(window.start ? { gte: window.start } : {}),
      ...(window.end ? { lt: window.end } : {}),
    },
  };
}

// ===== ROAS =====
//
// ثابتة دائمًا على نافذة 30 يومًا (بغض النظر عن الفترة المختارة فاللوحة) — لأن AdSpendEntry
// نفسه رقم متدحرج لآخر 30 يومًا بلا تاريخ لكل صف (راجع adsSyncService)، تمامًا كـ
// getCpaLast30Days أعلاه. عرض ROAS لفترة مختلفة (مثلاً "اليوم") مقابل مصروف 30 يومًا كان
// سيُنتج رقمًا مضلِّلًا لا معنى حقيقي له.
export async function getRoasLast30Days(): Promise<{ revenueDzd: number; spendDzd: number; roas: number | null }> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [revenueAgg, spendAgg] = await Promise.all([
    prisma.order.aggregate({
      where: { status: { in: [...REVENUE_STATUSES] }, createdAt: { gte: thirtyDaysAgo } },
      _sum: { totalDzd: true },
    }),
    prisma.adSpendEntry.aggregate({ _sum: { spendDzd: true } }),
  ]);

  const revenueDzd = revenueAgg._sum.totalDzd ?? 0;
  const spendDzd = spendAgg._sum.spendDzd ?? 0;
  return { revenueDzd, spendDzd, roas: spendDzd > 0 ? Math.round((revenueDzd / spendDzd) * 100) / 100 : null };
}

// ===== أداء كل منتج =====
export type ProductPerformanceRow = {
  slug: string;
  name: string;
  visits: number;
  totalOrders: number;
  confirmedOrders: number;
  deliveredOrders: number;
  cancelledOrders: number;
  returnedOrders: number;
  revenueDzd: number;
  conversionRate: number;
  confirmationRate: number;
  deliveryRate: number;
  cancellationRate: number;
};

type ProductOrdersRow = {
  slug: string;
  totalOrders: bigint;
  confirmedOrders: bigint;
  deliveredOrders: bigint;
  cancelledOrders: bigint;
  returnedOrders: bigint;
  revenueDzd: bigint | null;
};

type ProductVisitsRow = { slug: string; visits: bigint };

export async function getProductPerformanceTable(
  window: DateWindow,
  filters?: MasterFilters,
): Promise<ProductPerformanceRow[]> {
  const orderDateFilter = dateFilterSql(window, "o.created_at");
  const visitDateFilter = dateFilterSql(window, "created_at");
  // فلتر ولاية فقط هنا (لا منتج) — الجدول نفسه مقسَّم بالفعل حسب كل منتج، فتحديد منتج معيّن
  // فـفلتر اللوحة يعني عمليًا "أرِني هذا الصف فقط"، وهذا متروك للواجهة (تمييز/تعتيم الصفوف
  // الأخرى) بدل استعلام SQL منفصل يُعيد صفًا واحدًا فقط.
  const orderWilayaFilter = wilayaFilterSql(filters, "o.wilaya_code");

  const [products, orderRows, visitRows] = await Promise.all([
    prisma.product.findMany({ select: { slug: true, name: true } }),
    prisma.$queryRaw<ProductOrdersRow[]>`
      SELECT oi.product_slug_snapshot AS slug,
             COUNT(DISTINCT oi.order_id)::bigint AS "totalOrders",
             COUNT(DISTINCT oi.order_id) FILTER (WHERE o.status IN ('confirmed','shipped','delivered'))::bigint AS "confirmedOrders",
             COUNT(DISTINCT oi.order_id) FILTER (WHERE o.status = 'delivered')::bigint AS "deliveredOrders",
             COUNT(DISTINCT oi.order_id) FILTER (WHERE o.status = 'cancelled')::bigint AS "cancelledOrders",
             COUNT(DISTINCT oi.order_id) FILTER (WHERE o.status = 'returned')::bigint AS "returnedOrders",
             COALESCE(SUM(oi.line_total_dzd) FILTER (WHERE o.status IN ('confirmed','shipped','delivered')), 0)::bigint AS "revenueDzd"
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE 1=1 ${orderDateFilter} ${orderWilayaFilter}
      GROUP BY oi.product_slug_snapshot
    `,
    prisma.$queryRaw<ProductVisitsRow[]>`
      SELECT product_slug AS slug, COUNT(DISTINCT visitor_id)::bigint AS visits
      FROM tracking_events
      WHERE page_kind = 'product' AND event_type = 'page_view' AND product_slug IS NOT NULL ${visitDateFilter}
      GROUP BY product_slug
    `,
  ]);

  const nameBySlug = new Map(products.map((p) => [p.slug, p.name]));
  const orderBySlug = new Map(orderRows.map((r) => [r.slug, r]));
  const visitsBySlug = new Map(visitRows.map((r) => [r.slug, Number(r.visits)]));

  const allSlugs = new Set([...orderBySlug.keys(), ...visitsBySlug.keys()]);

  return Array.from(allSlugs)
    .map((slug) => {
      const o = orderBySlug.get(slug);
      const visits = visitsBySlug.get(slug) ?? 0;
      const totalOrders = Number(o?.totalOrders ?? 0);
      const confirmedOrders = Number(o?.confirmedOrders ?? 0);
      const deliveredOrders = Number(o?.deliveredOrders ?? 0);
      const cancelledOrders = Number(o?.cancelledOrders ?? 0);
      const returnedOrders = Number(o?.returnedOrders ?? 0);
      const revenueDzd = Number(o?.revenueDzd ?? 0);

      return {
        slug,
        name: nameBySlug.get(slug) ?? slug,
        visits,
        totalOrders,
        confirmedOrders,
        deliveredOrders,
        cancelledOrders,
        returnedOrders,
        revenueDzd,
        conversionRate: pct(confirmedOrders, visits),
        confirmationRate: pct(confirmedOrders, totalOrders),
        deliveryRate: pct(deliveredOrders, confirmedOrders),
        cancellationRate: pct(cancelledOrders, confirmedOrders + cancelledOrders),
      };
    })
    .sort((a, b) => b.revenueDzd - a.revenueDzd);
}

// ===== مقارنة الفترات (اليوم/أمس، 7 أيام/7 أيام سابقة، 30 يومًا/30 يومًا سابقة) =====
export type PeriodComparisonSide = Awaited<ReturnType<typeof getKpis>>;
export type PeriodComparison = {
  current: PeriodComparisonSide;
  previous: PeriodComparisonSide | null;
  deltaPct: Partial<Record<keyof PeriodComparisonSide, number | null>>;
};

function previousWindow(range: AnalyticsRange): DateWindow | null {
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  if (range === "today") {
    const start = new Date(startOfToday);
    start.setDate(start.getDate() - 1);
    return { start, end: startOfToday };
  }
  if (range === "yesterday") {
    const end = new Date(startOfToday);
    end.setDate(end.getDate() - 1);
    const start = new Date(end);
    start.setDate(start.getDate() - 1);
    return { start, end };
  }
  if (range === "7d" || range === "30d") {
    const days = range === "7d" ? 7 : 30;
    const end = new Date();
    end.setDate(end.getDate() - days);
    end.setHours(0, 0, 0, 0);
    const start = new Date(end);
    start.setDate(start.getDate() - days);
    return { start, end };
  }
  return null; // "all" — لا فترة سابقة ذات معنى للمقارنة
}

function deltaPct(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? null : 0; // لا نسبة مئوية حقيقية من صفر — "لا نهاية"
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export async function getPeriodComparison(range: AnalyticsRange): Promise<PeriodComparison> {
  const currentWindow = rangeToWindow(range);
  const prevWindow = previousWindow(range);

  const [current, previous] = await Promise.all([
    getKpis(currentWindow),
    prevWindow ? getKpis(prevWindow) : Promise.resolve(null),
  ]);

  const deltaKeys: (keyof PeriodComparisonSide)[] = [
    "totalOrders",
    "confirmedOrders",
    "deliveredOrders",
    "totalRevenueDzd",
    "totalTraffic",
    "confirmationRate",
    "deliveryRate",
  ];

  const deltas: PeriodComparison["deltaPct"] = {};
  if (previous) {
    for (const key of deltaKeys) {
      deltas[key] = deltaPct(Number(current[key]), Number(previous[key]));
    }
  }

  return { current, previous, deltaPct: deltas };
}

// ===== تنبيهات حقيقية مبنية على انخفاض فعلي مقارنة بأمس / بالأسبوع السابق =====
export type PerformanceAlert = { severity: "critical" | "warning"; metric: string; message: string };

// حراسة حد أدنى للعيّنة — طلب واحد يتحول إلى صفر يُنتج نسبة انخفاض 100% لا معنى تشغيليًا
// له (تقلّب طبيعي بحجم صغير جدًا)، فيُصدر تنبيهًا كاذبًا بلا فائدة.
const MIN_SAMPLE_FOR_ALERT = 5;

export async function getAlerts(): Promise<PerformanceAlert[]> {
  const [todayVsYesterday, week7dVsPrior7d] = await Promise.all([
    getPeriodComparison("today"),
    getPeriodComparison("7d"),
  ]);

  const alerts: PerformanceAlert[] = [];

  function checkRateDrop(
    comparison: PeriodComparison,
    key: "confirmationRate" | "deliveryRate",
    label: string,
    periodLabel: string,
  ) {
    if (!comparison.previous) return;
    const currentValue = comparison.current[key];
    const previousValue = comparison.previous[key];
    if (previousValue < 10) return; // معدل سابق شبه صفري أصلًا — أي انخفاض إضافي غير ذي دلالة
    const dropPp = previousValue - currentValue;
    if (dropPp >= 20) {
      alerts.push({
        severity: "critical",
        metric: key,
        message: `${label} انخفض ${dropPp.toFixed(1)} نقطة مئوية (${periodLabel}: ${previousValue}% ← ${currentValue}%)`,
      });
    } else if (dropPp >= 15) {
      alerts.push({
        severity: "warning",
        metric: key,
        message: `${label} انخفض ${dropPp.toFixed(1)} نقطة مئوية (${periodLabel}: ${previousValue}% ← ${currentValue}%)`,
      });
    }
  }

  function checkVolumeDrop(
    comparison: PeriodComparison,
    key: "totalOrders" | "totalTraffic",
    label: string,
    periodLabel: string,
  ) {
    if (!comparison.previous) return;
    const currentValue = Number(comparison.current[key]);
    const previousValue = Number(comparison.previous[key]);
    if (previousValue < MIN_SAMPLE_FOR_ALERT) return;
    const drop = comparison.deltaPct[key];
    if (drop === null || drop === undefined) return;
    if (drop <= -50) {
      alerts.push({
        severity: "critical",
        metric: key,
        message: `${label} انخفض ${Math.abs(drop).toFixed(0)}% (${periodLabel}: ${previousValue} ← ${currentValue})`,
      });
    } else if (drop <= -40) {
      alerts.push({
        severity: "warning",
        metric: key,
        message: `${label} انخفض ${Math.abs(drop).toFixed(0)}% (${periodLabel}: ${previousValue} ← ${currentValue})`,
      });
    }
  }

  checkRateDrop(todayVsYesterday, "confirmationRate", "معدل التأكيد", "اليوم مقابل الأمس");
  checkRateDrop(todayVsYesterday, "deliveryRate", "معدل التسليم", "اليوم مقابل الأمس");
  checkVolumeDrop(todayVsYesterday, "totalOrders", "عدد الطلبات", "اليوم مقابل الأمس");
  checkVolumeDrop(todayVsYesterday, "totalTraffic", "الزيارات", "اليوم مقابل الأمس");

  checkRateDrop(week7dVsPrior7d, "confirmationRate", "معدل التأكيد", "7 أيام مقابل 7 أيام سابقة");
  checkRateDrop(week7dVsPrior7d, "deliveryRate", "معدل التسليم", "7 أيام مقابل 7 أيام سابقة");
  checkVolumeDrop(week7dVsPrior7d, "totalOrders", "عدد الطلبات", "7 أيام مقابل 7 أيام سابقة");
  checkVolumeDrop(week7dVsPrior7d, "totalTraffic", "الزيارات", "7 أيام مقابل 7 أيام سابقة");

  return alerts;
}
