import { prisma } from "@/server/db/prisma";
import { listEventsForScope } from "@/server/repositories/trackingEventsRepository";

const PLATFORMS = ["facebook", "instagram", "tiktok"] as const;
type Platform = (typeof PLATFORMS)[number];

function pct(numerator: number, denominator: number): number {
  return denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : 0;
}

// عدد الزوار الفريدين (بمعرّف الزائر الثابت) لا عدد أحداث page_view الخام — إعادة تحميل
// نفس الزائر لنفس الصفحة (رجوع من واتساب، تحديث المتصفح) لا يجب أن تُحتسب "زيارة" إضافية،
// وإلا تُخفَّض كل معدلات التحويل/CTR اللاحقة ظلمًا بلا داعٍ.
function uniqueVisitorCount(events: { visitorId: string }[]): number {
  return new Set(events.map((e) => e.visitorId)).size;
}

export type ProductPageRow = {
  productSlug: string;
  productName: string;
  visits: number;
  bounceCount: number;
  bounceRate: number;
  ctaClicks: number;
  ctr: number;
  ordersCount: number;
  finalConversionRate: number;
  revenueDzd: number;
  aovDzd: number | null;
};

export type PlatformProductAnalytics = { platform: Platform; rows: ProductPageRow[] };

type ProductOrderAggRow = { platform: string; slug: string; ordersCount: bigint; revenueDzd: bigint | null };

// معدلات صفحة المنتج مبنية على أحداث تتبّع حقيقية (page_view/cta_click) من المتصفح مباشرة،
// والتحويل النهائي من طلبات حقيقية تحمل نفس المنتج + نفس المنصة.
//
// عدد الطلبات (COUNT DISTINCT) والإيراد لكل (platform, product) يُحسبان داخل Postgres عبر
// JOIN + GROUP BY بدل جلب كل صفوف order_items عبر Prisma وتصفيتها/عدّها فـJS — order_items
// جدول ينمو مع كل طلب، وكان هذا يعني نقل الجدول كاملاً فـكل تحميل للوحة التحكم.
export async function getProductPageAnalytics(): Promise<PlatformProductAnalytics[]> {
  const [events, orderAggRows, products] = await Promise.all([
    listEventsForScope({ pageKind: "product" }),
    prisma.$queryRaw<ProductOrderAggRow[]>`
      SELECT o.platform AS platform,
             oi.product_slug_snapshot AS slug,
             COUNT(DISTINCT oi.order_id)::bigint AS "ordersCount",
             SUM(oi.line_total_dzd)::bigint AS "revenueDzd"
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.platform IS NOT NULL
      GROUP BY o.platform, oi.product_slug_snapshot
    `,
    prisma.product.findMany({ select: { slug: true, name: true } }),
  ]);
  const nameBySlug = new Map(products.map((p) => [p.slug, p.name]));
  const orderAggByKey = new Map(
    orderAggRows.map((r) => [
      `${r.platform}:${r.slug}`,
      { ordersCount: Number(r.ordersCount), revenueDzd: Number(r.revenueDzd ?? 0) },
    ]),
  );

  return PLATFORMS.map((platform) => {
    const platformEvents = events.filter((e) => e.platform === platform && e.productSlug);
    const slugs = Array.from(new Set(platformEvents.map((e) => e.productSlug!)));

    const rows: ProductPageRow[] = slugs
      .map((slug) => {
        const slugEvents = platformEvents.filter((e) => e.productSlug === slug);
        const pageViews = slugEvents.filter((e) => e.eventType === "page_view");
        const ctaClicksEvents = slugEvents.filter((e) => e.eventType === "cta_click");
        const formSubmits = slugEvents.filter((e) => e.eventType === "form_submit");

        const visits = uniqueVisitorCount(pageViews);
        const ctaClicks = ctaClicksEvents.length;

        const engagedVisitorIds = new Set([...ctaClicksEvents, ...formSubmits].map((e) => e.visitorId));
        const bounceCount = pageViews.filter((e) => !engagedVisitorIds.has(e.visitorId)).length;

        const agg = orderAggByKey.get(`${platform}:${slug}`);
        const ordersCount = agg?.ordersCount ?? 0;
        // الإيراد يُحسب من مجموع بنود هذا المنتج تحديدًا داخل كل طلب (لا totalDzd الطلب
        // كاملًا) — طلب واحد قد يحتوي منتجًا رئيسيًا + عرضًا إضافيًا بمنتج مختلف، واحتساب
        // إجمالي الطلب هنا كان سيُضاعف الإيراد المنسوب لصفحتَي منتج مختلفتين.
        const revenueDzd = agg?.revenueDzd ?? 0;

        return {
          productSlug: slug,
          productName: nameBySlug.get(slug) ?? slug,
          visits,
          bounceCount,
          bounceRate: pct(bounceCount, visits),
          ctaClicks,
          ctr: pct(ctaClicks, visits),
          ordersCount,
          finalConversionRate: pct(ordersCount, visits),
          revenueDzd,
          aovDzd: ordersCount > 0 ? Math.round(revenueDzd / ordersCount) : null,
        };
      })
      .sort((a, b) => b.visits - a.visits);

    return { platform, rows };
  });
}

export type LandingPageRow = {
  funnelSlug: string;
  funnelTitle: string;
  visits: number;
  formSubmits: number;
  completionRate: number;
  abandonmentCount: number;
  abandonmentRate: number;
  formSubmissionRate: number;
  confirmedOrders: number;
  finalConversionRate: number;
  revenueDzd: number;
  aovDzd: number | null;
};

export type PlatformLandingAnalytics = { platform: Platform; rows: LandingPageRow[] };

type FunnelOrderAggRow = { platform: string; slug: string; ordersCount: bigint; revenueDzd: bigint | null };

// معدلات صفحة الهبوط (Funnel) — نفس منهجية صفحة المنتج، لكن مجمّعة حسب صفحة الهبوط
// نفسها (path) بدل المنتج فقط، لأن نفس المنتج ممكن يكون له أكثر من صفحة هبوط.
//
// نفس أسلوب الدفع لـPostgres أعلاه، لكن مقيّد بحالات الطلب المؤكَّدة فقط (confirmed/shipped/
// delivered) — مطابق تمامًا للتصفية السابقة عبر CONFIRMED_STATUSES.has(o.status) فـJS.
export async function getLandingPageAnalytics(): Promise<PlatformLandingAnalytics[]> {
  const [events, orderAggRows, funnels] = await Promise.all([
    listEventsForScope({ pageKind: "landing" }),
    prisma.$queryRaw<FunnelOrderAggRow[]>`
      SELECT o.platform AS platform,
             oi.product_slug_snapshot AS slug,
             COUNT(DISTINCT oi.order_id)::bigint AS "ordersCount",
             SUM(oi.line_total_dzd)::bigint AS "revenueDzd"
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.platform IS NOT NULL AND o.status IN ('confirmed', 'shipped', 'delivered')
      GROUP BY o.platform, oi.product_slug_snapshot
    `,
    prisma.funnel.findMany({
      where: { pageType: "funnel" },
      select: { slug: true, title: true, productId: true, product: { select: { slug: true } } },
    }),
  ]);

  const funnelBySlug = new Map(funnels.map((f) => [f.slug, f]));
  const orderAggByKey = new Map(
    orderAggRows.map((r) => [
      `${r.platform}:${r.slug}`,
      { ordersCount: Number(r.ordersCount), revenueDzd: Number(r.revenueDzd ?? 0) },
    ]),
  );

  return PLATFORMS.map((platform) => {
    const platformEvents = events.filter((e) => e.platform === platform && e.path);
    // path المخزّن هو مسار الصفحة الكامل (مثلاً /lp/my-funnel) — نستخرج منه الـ slug
    const funnelSlugs = Array.from(
      new Set(
        platformEvents
          .map((e) => e.path?.split("/").filter(Boolean).pop())
          .filter((slug): slug is string => !!slug && funnelBySlug.has(slug)),
      ),
    );

    const rows: LandingPageRow[] = funnelSlugs
      .map((slug) => {
        const funnel = funnelBySlug.get(slug)!;
        const slugEvents = platformEvents.filter((e) => e.path?.endsWith(`/${slug}`));
        const pageViews = slugEvents.filter((e) => e.eventType === "page_view");
        const formSubmitEvents = slugEvents.filter((e) => e.eventType === "form_submit");

        const visits = uniqueVisitorCount(pageViews);
        const formSubmits = formSubmitEvents.length;
        const abandonmentCount = Math.max(0, visits - formSubmits);

        const agg = orderAggByKey.get(`${platform}:${funnel.product.slug}`);
        const confirmedOrders = agg?.ordersCount ?? 0;
        const revenueDzd = agg?.revenueDzd ?? 0;

        return {
          funnelSlug: slug,
          funnelTitle: funnel.title,
          visits,
          formSubmits,
          completionRate: pct(formSubmits, visits),
          abandonmentCount,
          abandonmentRate: pct(abandonmentCount, visits),
          formSubmissionRate: pct(formSubmits, visits),
          confirmedOrders,
          finalConversionRate: pct(confirmedOrders, visits),
          revenueDzd,
          aovDzd: confirmedOrders > 0 ? Math.round(revenueDzd / confirmedOrders) : null,
        };
      })
      .sort((a, b) => b.visits - a.visits);

    return { platform, rows };
  });
}
