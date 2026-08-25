import type { MetadataRoute } from "next";
import { SITE_URL } from "@/data/site";
import { getPublishedProducts, getCategories } from "@/lib/storefrontData";
import { prisma } from "@/server/db/prisma";

// force-dynamic بدل revalidate الثابت: sitemap.ts (خلافًا لصفحات (storefront) العادية) مسار
// Metadata منفصل لا يمر بـ(storefront)/layout.tsx، فلا يستفيد من إجبار headers() للـrendering
// الديناميكي هناك — بلا هذا كان Next.js يحاول توليده Statically وقت "next build" فعليًا،
// فيستدعي قاعدة البيانات حينها (اكتُشف فعليًا: بناء Docker بلا اتصال DB حيّ كان يفشل بالضبط
// هنا). الآن يُولَّد عند أول طلب حقيقي بدل زمن البناء — أحدث فعليًا من revalidate=3600 السابق
// (لا تجميد لمدة تصل لساعة)، ويزيل اعتماد البناء على قاعدة بيانات حيّة.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, categories, productDates, categoryDates] = await Promise.all([
    getPublishedProducts(),
    getCategories(),
    // إشارة تحديث حقيقية لجوجل — سطر خفيف (slug + updatedAt فقط) بدل تحميل بيانات كاملة مرتين.
    prisma.product.findMany({ where: { isPublished: true }, select: { slug: true, updatedAt: true } }),
    prisma.category.findMany({ select: { slug: true, createdAt: true } }),
  ]);
  const productDateBySlug = new Map(productDates.map((p) => [p.slug, p.updatedAt]));
  // لا يوجد حقل updatedAt في نموذج Category — نستعمل createdAt كبديل معقول.
  const categoryDateBySlug = new Map(categoryDates.map((c) => [c.slug, c.createdAt]));

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/products`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/contact`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/about`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${SITE_URL}/payment-methods`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${SITE_URL}/shipping-delivery`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${SITE_URL}/faq`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${SITE_URL}/return-policy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/privacy-policy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/terms-of-service`, changeFrequency: "yearly", priority: 0.2 },
  ];

  const productRoutes: MetadataRoute.Sitemap = products.map((product) => ({
    url: `${SITE_URL}/products/${product.slug}`,
    lastModified: productDateBySlug.get(product.slug),
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  const categoryRoutes: MetadataRoute.Sitemap = categories.map((category) => ({
    url: `${SITE_URL}/category/${category.slug}`,
    lastModified: categoryDateBySlug.get(category.slug),
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  return [...staticRoutes, ...productRoutes, ...categoryRoutes];
}
