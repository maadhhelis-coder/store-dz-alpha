// طبقة قراءة بيانات الموقع العام (storefront) — تجلب من قاعدة بيانات Prisma الحقيقية
// (نفس المصدر الذي تديره لوحة التحكم)، بدل الملفات الثابتة القديمة data/products.ts
// وdata/categories.ts. أي تعديل من /admin ينعكس هنا فورًا لأنه نفس المصدر تمامًا.
import { cache } from "react";
import { prisma } from "@/server/db/prisma";
import type { Prisma } from "@prisma/client";
import type { Product, ProductBadge, ProductVariant } from "@/data/products";
import type { Category } from "@/data/categories";

const BADGE_MAP: Record<string, ProductBadge> = {
  bestseller: "الأكثر مبيعًا",
  new: "جديد",
  sale: "عرض خاص",
};

const productWithRelations = {
  include: {
    category: true,
    images: { orderBy: { sortOrder: "asc" as const } },
    variants: { orderBy: { sortOrder: "asc" as const } },
  },
} satisfies Prisma.ProductDefaultArgs;

export type ProductRow = Prisma.ProductGetPayload<typeof productWithRelations>;

// مُصدَّرة لإعادة استعمالها حيث تُجلب منتجات بنفس الشكل من مصدر آخر (مثلاً funnel.product
// في lp/[slug]/page.tsx) بدل تكرار منطق التحويل.
export function mapProduct(p: ProductRow): Product {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    categorySlug: p.category.slug,
    price: p.priceDzd,
    oldPrice: p.oldPriceDzd ?? undefined,
    shortDescription: p.shortDescription,
    longDescriptionHtml: p.longDescriptionHtml,
    howToUse: Array.isArray(p.howToUse) ? (p.howToUse as unknown[]).filter((s): s is string => typeof s === "string") : [],
    images: p.images.length > 0 ? p.images.map((img) => img.url) : ["/images/placeholder.jpg"],
    badge: p.badge ? BADGE_MAP[p.badge] : undefined,
    inStock: p.inStock && p.inventoryCount > 0,
    lowStockCount: p.inventoryCount > 0 && p.inventoryCount <= LOW_STOCK_THRESHOLD ? p.inventoryCount : undefined,
    variants: p.variants.map(mapVariant),
  };
}

// نفس عتبة "منتجات على وشك النفاد" المستعملة أصلًا فلوحة التحكم الرئيسية
// (راجع dashboardRepository.ts) — عتبة واحدة موحّدة بدل رقم عشوائي ثانٍ.
const LOW_STOCK_THRESHOLD = 5;

function mapVariant(v: ProductRow["variants"][number]): ProductVariant {
  return {
    id: v.id,
    name: v.name,
    value: v.value,
    priceDzd: v.priceOverrideDzd ?? undefined,
    inStock: v.inventoryCount > 0,
  };
}

function mapCategory(c: Prisma.CategoryGetPayload<Record<string, never>>): Category {
  const icon = c.icon === "smartphone" || c.icon === "shirt" || c.icon === "home" ? c.icon : "home";
  return {
    slug: c.slug,
    name: c.name,
    shortDescription: c.shortDescription ?? "",
    description: c.description ?? "",
    image: c.imageUrl ?? "/images/placeholder.jpg",
    icon,
  };
}

export async function getPublishedProducts(): Promise<Product[]> {
  const rows = await prisma.product.findMany({
    where: { isPublished: true },
    ...productWithRelations,
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });
  return rows.map(mapProduct);
}

// الصفحة الرئيسية تعرض 8 منتجات فقط — كانت تجلب الكتالوج كاملًا بكل الصور والمتغيّرات ثم
// تُفلتر/تُقصّ فالذاكرة (FeaturedProducts.tsx)، فتُنفَّذ استعلامًا ضخمًا على كل تحميل صفحة
// بعد إزالة الـISR الكامل. هنا الاستعلام محدود من قاعدة البيانات مباشرة، بنفس المنطق
// الأصلي تمامًا (منتجات ذات badge أولًا، أو أول 8 منتجات عمومًا لو كانت أقل من 4 badge).
export async function getFeaturedProducts(limit = 8): Promise<Product[]> {
  const badged = await prisma.product.findMany({
    where: { isPublished: true, badge: { not: null } },
    ...productWithRelations,
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    take: limit,
  });
  if (badged.length >= 4) return badged.map(mapProduct);

  const fallback = await prisma.product.findMany({
    where: { isPublished: true },
    ...productWithRelations,
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    take: limit,
  });
  return fallback.map(mapProduct);
}

export async function getPublishedProductBySlug(slug: string): Promise<Product | undefined> {
  const row = await prisma.product.findFirst({
    where: { slug, isPublished: true },
    ...productWithRelations,
  });
  return row ? mapProduct(row) : undefined;
}

export const PRODUCTS_PAGE_SIZE = 12;

// جلب مُقسَّم لصفحات (server-side pagination) مع فلترة اختيارية حسب التصنيف — يعوّض
// ProductGrid السابق الذي كان يحمّل كل المنتجات دفعة واحدة ويفلتر بالفئة بالكامل على
// المتصفح (state محلي بلا أي انعكاس على الرابط)، وهو ما لا يصمد أمام كتالوج أكبر.
export async function getPublishedProductsPage(options: {
  categorySlug?: string;
  page: number;
  pageSize?: number;
}): Promise<{ products: Product[]; total: number }> {
  const pageSize = options.pageSize ?? PRODUCTS_PAGE_SIZE;
  const page = Math.max(1, options.page);
  const where: Prisma.ProductWhereInput = {
    isPublished: true,
    ...(options.categorySlug ? { category: { slug: options.categorySlug } } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.product.findMany({
      where,
      ...productWithRelations,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.product.count({ where }),
  ]);

  return { products: rows.map(mapProduct), total };
}

// لا يوجد ربط "منتجات ذات صلة" صريح في قاعدة البيانات — أقرب بديل حقيقي ومفيد هو باقي
// منتجات نفس التصنيف، بدل حقل relatedSlugs الثابت القديم غير المدعوم في المخطط الفعلي.
export async function getRelatedProducts(product: Product, limit = 4): Promise<Product[]> {
  const rows = await prisma.product.findMany({
    where: { isPublished: true, category: { slug: product.categorySlug }, slug: { not: product.slug } },
    ...productWithRelations,
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    take: limit,
  });
  return rows.map(mapProduct);
}

// بحث بسيط بالاسم أو الوصف المختصر — لا يوجد فهرسة نصية كاملة (full-text search) بعد،
// فيكفي contains لحجم كتالوج متجر صغير/متوسط حاليًا. مُرقَّمة (pagination) بنفس نمط
// getPublishedProductsPage — بحث بكلمة عامة على كتالوج أكبر كان سيجلب كل النتائج دفعة واحدة.
export async function searchPublishedProducts(
  query: string,
  options: { page: number; pageSize?: number },
): Promise<{ products: Product[]; total: number }> {
  const q = query.trim();
  if (!q) return { products: [], total: 0 };

  const pageSize = options.pageSize ?? PRODUCTS_PAGE_SIZE;
  const page = Math.max(1, options.page);
  const where: Prisma.ProductWhereInput = {
    isPublished: true,
    OR: [
      { name: { contains: q, mode: "insensitive" } },
      { shortDescription: { contains: q, mode: "insensitive" } },
    ],
  };

  const [rows, total] = await Promise.all([
    prisma.product.findMany({
      where,
      ...productWithRelations,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.product.count({ where }),
  ]);

  return { products: rows.map(mapProduct), total };
}

// cache() يُوحِّد الاستدعاءات المتعددة لنفس دورة الطلب (مثلاً generateMetadata والمكوّن
// نفسه فـproducts/page.tsx يستدعيانها منفصلين) إلى استعلام واحد فعلي.
export const getCategories = cache(async function getCategories(): Promise<Category[]> {
  const rows = await prisma.category.findMany({ orderBy: { sortOrder: "asc" } });
  return rows.map(mapCategory);
});

export async function getCategoryBySlug(slug: string): Promise<Category | undefined> {
  const row = await prisma.category.findUnique({ where: { slug } });
  return row ? mapCategory(row) : undefined;
}
