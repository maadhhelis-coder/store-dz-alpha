import type { MetadataRoute } from "next";
import { SITE_URL } from "@/data/site";
import { getPublishedProducts, getCategories } from "@/lib/storefrontData";
import { getAllBlogPosts } from "@/lib/blog";
import { prisma } from "@/server/db/prisma";

// أُزيل force-static — كان يجمّد الخريطة على المنتجات/التصنيفات الثابتة القديمة إلى
// الأبد بغض النظر عن حجم الكتالوج الحقيقي؛ الآن تُبنى من قاعدة البيانات مع إعادة توليد
// دورية (revalidate) بدل تجميد كامل.
export const revalidate = 3600;

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
    { url: `${SITE_URL}/blog`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/about`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/faq`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/contact`, changeFrequency: "monthly", priority: 0.5 },
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

  const blogRoutes: MetadataRoute.Sitemap = getAllBlogPosts().map((post) => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    lastModified: post.updatedDate ?? post.publishedDate,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  return [...staticRoutes, ...productRoutes, ...categoryRoutes, ...blogRoutes];
}
