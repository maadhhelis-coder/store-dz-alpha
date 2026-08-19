import { prisma } from "@/server/db/prisma";
import type { OrderStatus, Prisma } from "@prisma/client";
import type { DateWindow } from "@/server/repositories/analyticsRepository";

function createdAtWhere(window: DateWindow | undefined): Prisma.OrderWhereInput {
  if (!window?.start && !window?.end) return {};
  return {
    createdAt: {
      ...(window?.start ? { gte: window.start } : {}),
      ...(window?.end ? { lt: window.end } : {}),
    },
  };
}

const CONFIRMED_STATUSES: OrderStatus[] = ["confirmed", "shipped", "delivered"];
const PLATFORMS = ["facebook", "instagram", "tiktok"] as const;
type Platform = (typeof PLATFORMS)[number];

function pct(numerator: number, denominator: number): number {
  return denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : 0;
}

function creativeKey(platform: string, creativeName: string | null): string {
  return `${platform}:${creativeName ?? "بدون اسم"}`;
}

export type CreativePerformance = {
  id: string;
  creativeName: string;
  ordersCount: number;
  confirmedCount: number;
  deliveredCount: number;
  conversionRate: number | null;
  confirmedRate: number;
  deliveredRate: number;
  clicks: number;
  spendDzd: number;
  costPerDelivered: number | null;
  revenueDzd: number;
  aovDzd: number | null;
};

export type PlatformCreativeAnalytics = {
  platform: Platform;
  creatives: CreativePerformance[];
  overallConfirmedRate: number;
  overallDeliveredRate: number;
};

export type StoreWideRates = {
  totalOrders: number;
  confirmedOrders: number;
  deliveredOrders: number;
  confirmationRate: number;
  deliveryRate: number;
};

// معدلات شاملة عبر كل الطلبات في المتجر بلا أي تصفية — كل المنصات (Facebook/Instagram/
// TikTok/الموقع مباشرة/واتساب) وكل المنتجات معًا، وليس فقط الطلبات المنسوبة لإعلان.
//
// العدّ عبر count() (يُنفَّذ داخل Postgres) بدل جلب كل صفوف الطلبات لعدّها فـJS — الفرق
// النهائي صفر (نفس الأرقام تمامًا)، لكن الأول ينقل 3 أرقام فقط عبر الشبكة مهما كبر
// جدول Order، بينما الثاني كان ينقل كل الجدول فـكل تحميل للوحة التحكم.
export async function getStoreWideRates(window?: DateWindow): Promise<StoreWideRates> {
  const dateWhere = createdAtWhere(window);
  const [totalOrders, confirmedOrders, deliveredOrders] = await Promise.all([
    prisma.order.count({ where: dateWhere }),
    prisma.order.count({ where: { status: { in: CONFIRMED_STATUSES }, ...dateWhere } }),
    prisma.order.count({ where: { status: "delivered", ...dateWhere } }),
  ]);

  return {
    totalOrders,
    confirmedOrders,
    deliveredOrders,
    confirmationRate: pct(confirmedOrders, totalOrders),
    deliveryRate: pct(deliveredOrders, totalOrders),
  };
}

// أداء كل كرياتيف مبني على طلبات حقيقية (Order.platform + Order.creativeName) — لا يوجد
// إدخال يدوي للطلبات نفسها، فقط المصروف والنقرات (AdSpendEntry) لأن المتجر لا يملك اتصال
// API حقيقي بحسابات الإعلانات.
//
// العد والمجموع عبر groupBy (3 استعلامات صغيرة، كل واحد يُرجع صفًا واحدًا فقط لكل
// (platform, creativeName) — أي بعدد الكرياتيفات الفعلية لا بعدد الطلبات) بدل جلب كل
// صفوف الطلبات وتصفيتها/جمعها فـJS. النتيجة النهائية مطابقة رياضيًا للنسخة السابقة.
export async function getCreativeAnalytics(window?: DateWindow): Promise<PlatformCreativeAnalytics[]> {
  const dateWhere = createdAtWhere(window);
  const [totalGroups, confirmedGroups, deliveredGroups, spendEntries] = await Promise.all([
    prisma.order.groupBy({
      by: ["platform", "creativeName"],
      where: { platform: { not: null }, ...dateWhere },
      _count: { _all: true },
    }),
    prisma.order.groupBy({
      by: ["platform", "creativeName"],
      where: { platform: { not: null }, status: { in: CONFIRMED_STATUSES }, ...dateWhere },
      _count: { _all: true },
      _sum: { totalDzd: true },
    }),
    prisma.order.groupBy({
      by: ["platform", "creativeName"],
      where: { platform: { not: null }, status: "delivered", ...dateWhere },
      _count: { _all: true },
    }),
    // AdSpendEntry بلا عمود تاريخ لكل صف (رقم متدحرج لآخر 30 يومًا دائمًا — راجع
    // adsSyncService/getRoasLast30Days) — يبقى غير مفلتَر بالفترة المختارة عمدًا، موثَّق فـ
    // الواجهة (ROAS مثبَّت على 30 يومًا بصرف النظر عن الفلتر).
    prisma.adSpendEntry.findMany(),
  ]);

  const ordersCountByKey = new Map(
    totalGroups.map((g) => [creativeKey(g.platform as Platform, g.creativeName), g._count._all]),
  );
  const confirmedByKey = new Map(
    confirmedGroups.map((g) => [
      creativeKey(g.platform as Platform, g.creativeName),
      { count: g._count._all, revenueDzd: g._sum.totalDzd ?? 0 },
    ]),
  );
  const deliveredCountByKey = new Map(
    deliveredGroups.map((g) => [creativeKey(g.platform as Platform, g.creativeName), g._count._all]),
  );

  return PLATFORMS.map((platform) => {
    const platformSpend = spendEntries.filter((s) => s.platform === platform);

    const names = Array.from(
      new Set([
        ...totalGroups.filter((g) => g.platform === platform).map((g) => g.creativeName ?? "بدون اسم"),
        ...platformSpend.map((s) => s.creativeName),
      ]),
    );

    const creatives: CreativePerformance[] = names
      .map((name) => {
        const key = creativeKey(platform, name === "بدون اسم" ? null : name);
        const ordersCount = ordersCountByKey.get(key) ?? 0;
        const confirmed = confirmedByKey.get(key);
        const confirmedCount = confirmed?.count ?? 0;
        const revenueDzd = confirmed?.revenueDzd ?? 0;
        const deliveredCount = deliveredCountByKey.get(key) ?? 0;
        const spend = platformSpend.find((s) => s.creativeName === name);
        const clicks = spend?.clicks ?? 0;
        const spendDzd = spend?.spendDzd ?? 0;

        return {
          id: spend?.id ?? `virtual-${platform}-${name}`,
          creativeName: name,
          ordersCount,
          confirmedCount,
          deliveredCount,
          conversionRate: clicks > 0 ? pct(ordersCount, clicks) : null,
          confirmedRate: pct(confirmedCount, ordersCount),
          deliveredRate: pct(deliveredCount, ordersCount),
          clicks,
          spendDzd,
          costPerDelivered: deliveredCount > 0 ? Math.round(spendDzd / deliveredCount) : null,
          revenueDzd,
          aovDzd: confirmedCount > 0 ? Math.round(revenueDzd / confirmedCount) : null,
        };
      })
      .sort((a, b) => b.ordersCount - a.ordersCount);

    const totalOrders = creatives.reduce((sum, c) => sum + c.ordersCount, 0);
    const totalConfirmed = creatives.reduce((sum, c) => sum + c.confirmedCount, 0);
    const totalDelivered = creatives.reduce((sum, c) => sum + c.deliveredCount, 0);

    return {
      platform,
      creatives,
      overallConfirmedRate: pct(totalConfirmed, totalOrders),
      overallDeliveredRate: pct(totalDelivered, totalOrders),
    };
  });
}
