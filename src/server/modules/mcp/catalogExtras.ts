import { prisma } from "@/server/db/prisma";

// ما «نحطّه في المتجر» سوى المنتجات: العروض الإضافية النشطة والكوبونات الصالحة الآن.
// مصدر واحد للوكيل الخارجي (REST /api/admin/catalog-extras) ولأداة MCP get_catalog_extras.
// الكوبونات الصالحة فقط (نشطة، غير منتهية، لم تبلغ حد الاستعمال) — لا أسرار هنا.

export async function getCatalogExtras() {
  const now = new Date();
  const [offers, coupons] = await Promise.all([
    prisma.offer.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: {
        triggerProduct: { select: { slug: true, name: true } },
        offerProduct: { select: { slug: true, name: true, priceDzd: true, inStock: true, isPublished: true } },
      },
    }),
    prisma.coupon.findMany({
      where: { isActive: true, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return {
    offers: offers
      .filter((o) => o.offerProduct.isPublished)
      .map((o) => ({
        title: o.title,
        triggerProductSlug: o.triggerProduct.slug,
        triggerProductName: o.triggerProduct.name,
        offerProductSlug: o.offerProduct.slug,
        offerProductName: o.offerProduct.name,
        regularPriceDzd: o.offerProduct.priceDzd,
        offerPriceDzd: o.offerPriceDzd,
        inStock: o.offerProduct.inStock,
      })),
    coupons: coupons
      .filter((c) => c.usageLimit === null || c.usedCount < c.usageLimit)
      .map((c) => ({
        code: c.code,
        type: c.type,
        value: c.value,
        minOrderDzd: c.minOrderDzd,
        expiresAt: c.expiresAt?.toISOString() ?? null,
      })),
  };
}
