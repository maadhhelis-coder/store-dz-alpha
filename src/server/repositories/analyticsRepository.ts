import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { countPageViews } from "@/server/repositories/pageViewsRepository";

export type AnalyticsRange = "today" | "yesterday" | "7d" | "30d" | "all";

const REVENUE_STATUSES = ["confirmed", "shipped", "delivered"] as const;

export type DateWindow = { start?: Date; end?: Date };

export function rangeToWindow(range: AnalyticsRange): DateWindow {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  if (range === "today") return { start: startOfToday };

  if (range === "yesterday") {
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);
    return { start: startOfYesterday, end: startOfToday };
  }

  if (range === "7d" || range === "30d") {
    const days = range === "7d" ? 7 : 30;
    const start = new Date();
    start.setDate(start.getDate() - days);
    start.setHours(0, 0, 0, 0);
    return { start };
  }

  return {};
}

function createdAtWhere(window: DateWindow) {
  if (!window.start && !window.end) return {};
  return {
    createdAt: {
      ...(window.start ? { gte: window.start } : {}),
      ...(window.end ? { lt: window.end } : {}),
    },
  };
}

// فلتر منتج/ولاية شامل (لوحة الأداء الشاملة) — منتج عبر علاقة items (طلب واحد قد يحتوي أكثر
// من منتج، مثلاً عرض إضافي Upsell؛ "يحتوي هذا المنتج" وليس "هذا المنتج فقط") وولاية عبر عمود
// مباشر على Order نفسه.
export type MasterFilters = { productSlug?: string; wilayaCode?: number };

export function orderFiltersWhere(filters?: MasterFilters): Prisma.OrderWhereInput {
  if (!filters) return {};
  return {
    ...(filters.wilayaCode ? { wilayaCode: filters.wilayaCode } : {}),
    ...(filters.productSlug ? { items: { some: { productSlugSnapshot: filters.productSlug } } } : {}),
  };
}

export function leadFiltersWhere(filters?: MasterFilters): Prisma.LeadWhereInput {
  if (!filters) return {};
  return {
    ...(filters.wilayaCode ? { wilayaCode: filters.wilayaCode } : {}),
    ...(filters.productSlug ? { productSlug: filters.productSlug } : {}),
  };
}

// كل مستدعيات هذه الدالة حاليًا تمرر نصًا حرفيًا ثابتًا (لا قيمة من الطلب) — لكن Prisma.raw
// لا يُهرِّب شيئًا بنفسه، فهي آمنة فقط بانضباط المستدعي. هذا Allowlist دفاع إضافي: حتى لو
// استُهلكت الدالة مستقبلًا بقيمة column ديناميكية بالخطأ، تُرفض فورًا بدل الوصول لـPrisma.raw.
const ALLOWED_DATE_FILTER_COLUMNS = new Set(["created_at", "o.created_at"]);

function dateFilterSql(window: DateWindow, column: string) {
  if (!ALLOWED_DATE_FILTER_COLUMNS.has(column)) {
    throw new Error(`dateFilterSql: عمود غير مسموح به: ${column}`);
  }
  const parts: Prisma.Sql[] = [];
  if (window.start) parts.push(Prisma.sql`AND ${Prisma.raw(column)} >= ${window.start}`);
  if (window.end) parts.push(Prisma.sql`AND ${Prisma.raw(column)} < ${window.end}`);
  return parts.length ? Prisma.join(parts, " ") : Prisma.empty;
}

export async function getKpis(window: DateWindow, filters?: MasterFilters) {
  const where = { ...createdAtWhere(window), ...orderFiltersWhere(filters) };
  const leadWhere = { ...createdAtWhere(window), ...leadFiltersWhere(filters) };

  // ست استعلامات مستقلة تمامًا — بالتوازي الآن (راجع مذكرة pooler، آمن بعد التحول لـ
  // transaction pooler)، بدل الانتظار التسلسلي القديم.
  //
  // totalTraffic (page_views) بلا فلتر منتج/ولاية عمدًا — الجدول لا يملك أي عمود منتج أو
  // ولاية (زيارة مجهولة الهوية قبل أي بيانات عميل)، فيبقى رقمًا شاملًا للموقع كله حتى مع
  // فلتر نشط، موثَّق فـالواجهة.
  const [revenueAgg, totalOrders, confirmedOrders, newLeads, totalTraffic, deliveredOrders] = await Promise.all([
    prisma.order.aggregate({
      where: { status: { in: [...REVENUE_STATUSES] }, ...where },
      _sum: { totalDzd: true },
    }),
    prisma.order.count({ where }),
    prisma.order.count({ where: { status: { in: [...REVENUE_STATUSES] }, ...where } }),
    prisma.lead.count({ where: leadWhere }),
    countPageViews(window.start, window.end),
    prisma.order.count({ where: { status: "delivered", ...where } }),
  ]);

  const totalRevenueDzd = revenueAgg._sum.totalDzd ?? 0;
  const avgOrderValueDzd = confirmedOrders > 0 ? Math.round(totalRevenueDzd / confirmedOrders) : 0;
  const confirmationRate = totalOrders > 0 ? Math.round((confirmedOrders / totalOrders) * 1000) / 10 : 0;
  // نسبة التسليم من الطلبات المؤكَّدة (وليس من كل الطلبات) — تقيس فعليًا كم من الطلبات
  // التي أكّدها الزبون تصل فعلًا (بدل أن ترفض عند التسليم)، وهو المقياس المفيد تشغيليًا.
  const deliveryRate = confirmedOrders > 0 ? Math.round((deliveredOrders / confirmedOrders) * 1000) / 10 : 0;

  return {
    totalRevenueDzd,
    totalOrders,
    confirmedOrders,
    deliveredOrders,
    avgOrderValueDzd,
    newLeads,
    totalTraffic,
    confirmationRate,
    deliveryRate,
  };
}

// تكلفة اكتساب الطلب (CPA) = إجمالي المصروف الإعلاني ÷ عدد الطلبات المؤكَّدة، محسوبة على
// نافذة 30 يومًا الثابتة لأن AdSpendEntry نفسه رقم متدحرج لآخر 30 يومًا (راجع adsSyncService)
// وليس له تاريخ لكل صف — لا يمكن ربطه بمدى تاريخ اختياري (اليوم/أمس/الكل...) بدقة.
export async function getCpaLast30Days() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [spendAgg, confirmedOrders] = [
    await prisma.adSpendEntry.aggregate({ _sum: { spendDzd: true } }),
    await prisma.order.count({
      where: { status: { in: [...REVENUE_STATUSES] }, createdAt: { gte: thirtyDaysAgo } },
    }),
  ];

  const totalSpendDzd = spendAgg._sum.spendDzd ?? 0;
  const cpaDzd = confirmedOrders > 0 ? Math.round(totalSpendDzd / confirmedOrders) : null;

  return { totalSpendDzd, confirmedOrders, cpaDzd };
}

type RevenueByDayRow = { day: Date; revenue: bigint | null; orders: bigint };

export async function getRevenueByDay(window: DateWindow) {
  const dateFilter = window.start
    ? dateFilterSql(window, "created_at")
    : Prisma.sql`AND created_at >= now() - interval '30 days'`;

  const rows = await prisma.$queryRaw<RevenueByDayRow[]>`
    SELECT date_trunc('day', created_at) AS day,
           SUM(total_dzd)::bigint AS revenue,
           COUNT(*)::bigint AS orders
    FROM orders
    WHERE status IN ('confirmed', 'shipped', 'delivered') ${dateFilter}
    GROUP BY day
    ORDER BY day ASC
  `;

  return rows.map((row) => ({
    date: row.day.toISOString().slice(0, 10),
    revenueDzd: Number(row.revenue ?? 0),
    orders: Number(row.orders),
  }));
}

export async function getStatusBreakdown(window: DateWindow) {
  const rows = await prisma.order.groupBy({
    by: ["status"],
    where: createdAtWhere(window),
    _count: true,
  });

  return rows
    .map((row) => ({ status: row.status, count: row._count }))
    .sort((a, b) => b.count - a.count);
}

type TopProductRow = { slug: string; name: string; qty: bigint; revenue: bigint };

export async function getTopProducts(window: DateWindow, limit: number) {
  const dateFilter = dateFilterSql(window, "o.created_at");

  const rows = await prisma.$queryRaw<TopProductRow[]>`
    SELECT oi.product_slug_snapshot AS slug,
           oi.product_name_snapshot AS name,
           SUM(oi.quantity)::bigint AS qty,
           SUM(oi.line_total_dzd)::bigint AS revenue
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.status IN ('confirmed', 'shipped', 'delivered') ${dateFilter}
    GROUP BY oi.product_slug_snapshot, oi.product_name_snapshot
    ORDER BY revenue DESC
    LIMIT ${limit}
  `;

  return rows.map((row) => ({
    slug: row.slug,
    name: row.name,
    quantity: Number(row.qty),
    revenueDzd: Number(row.revenue),
  }));
}

type TopWilayaRow = { code: number; name: string; orders: bigint; revenue: bigint };

export async function getTopWilayas(window: DateWindow, limit: number) {
  const dateFilter = dateFilterSql(window, "created_at");

  const rows = await prisma.$queryRaw<TopWilayaRow[]>`
    SELECT wilaya_code AS code,
           wilaya_name AS name,
           COUNT(*)::bigint AS orders,
           SUM(total_dzd)::bigint AS revenue
    FROM orders
    WHERE status IN ('confirmed', 'shipped', 'delivered') ${dateFilter}
    GROUP BY wilaya_code, wilaya_name
    ORDER BY revenue DESC
    LIMIT ${limit}
  `;

  return rows.map((row) => ({
    code: row.code,
    name: row.name,
    orders: Number(row.orders),
    revenueDzd: Number(row.revenue),
  }));
}

type PathViewRow = { path: string; views: bigint };

export async function getBestFunnels(window: DateWindow, limit: number) {
  const dateFilter = dateFilterSql(window, "created_at");

  const rows = await prisma.$queryRaw<PathViewRow[]>`
    SELECT path, COUNT(*)::bigint AS views
    FROM page_views
    WHERE path LIKE '/lp/%' ${dateFilter}
    GROUP BY path
    ORDER BY views DESC
    LIMIT ${limit}
  `;

  if (rows.length === 0) return [];

  const slugs = rows.map((r) => r.path.replace(/^\/lp\//, "").replace(/\/$/, ""));
  const funnels = await prisma.funnel.findMany({ where: { slug: { in: slugs } } });
  const bySlug = new Map(funnels.map((f) => [f.slug, f]));

  return rows.map((row) => {
    const slug = row.path.replace(/^\/lp\//, "").replace(/\/$/, "");
    const funnel = bySlug.get(slug);
    return {
      slug,
      title: funnel?.title ?? slug,
      views: Number(row.views),
    };
  });
}

type OfferUsageRow = { offerId: string; orders: bigint; revenue: bigint | null };

export async function getBestOffers(window: DateWindow, limit: number) {
  const dateFilter = dateFilterSql(window, "o.created_at");

  // نجمع line_total_dzd الفعلي المحفوظ وقت كل طلب (بدل ضرب سعر العرض الحالي × عدد
  // الطلبات) — لأن سعر العرض قد يتغيّر لاحقًا من لوحة التحكم، فضربه بأثر رجعي على طلبات
  // قديمة يُنتج رقم إيراد خاطئ لا يعكس ما دُفع فعليًا.
  const rows = await prisma.$queryRaw<OfferUsageRow[]>`
    SELECT o.offer_id AS "offerId", COUNT(DISTINCT o.id)::bigint AS orders, SUM(oi.line_total_dzd)::bigint AS revenue
    FROM orders o
    JOIN offers ofr ON ofr.id = o.offer_id
    JOIN order_items oi ON oi.order_id = o.id AND oi.product_id = ofr.offer_product_id
    WHERE o.offer_id IS NOT NULL AND o.status IN ('confirmed', 'shipped', 'delivered') ${dateFilter}
    GROUP BY o.offer_id
    ORDER BY orders DESC
    LIMIT ${limit}
  `;

  if (rows.length === 0) return [];

  const offerIds = rows.map((r) => r.offerId);
  const offers = await prisma.offer.findMany({
    where: { id: { in: offerIds } },
    include: { offerProduct: true, triggerProduct: true },
  });
  const byId = new Map(offers.map((o) => [o.id, o]));

  return rows
    .map((row) => {
      const offer = byId.get(row.offerId);
      if (!offer) return null;
      return {
        id: offer.id,
        title: offer.title,
        triggerProductName: offer.triggerProduct.name,
        offerProductName: offer.offerProduct.name,
        orders: Number(row.orders),
        revenueDzd: Number(row.revenue ?? 0),
      };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);
}
