import type { Metadata } from "next";
import Breadcrumbs from "@/components/shared/Breadcrumbs";
import SectionHeading from "@/components/shared/SectionHeading";
import ProductGrid from "@/components/commerce/ProductGrid";
import StorefrontPagination from "@/components/shared/StorefrontPagination";
import { getPublishedProductsPage, getCategories, PRODUCTS_PAGE_SIZE } from "@/lib/storefrontData";
import { buildMetadata } from "@/lib/seo";

type ProductsPageProps = {
  searchParams: Promise<{ page?: string; category?: string }>;
};

// كل تصنيف فلترة (?category=) صفحة محتوى مختلفة فعليًا فتستحق canonical/title خاص بها؛
// أما صفحات الترقيم (?page=2+) فمحتواها مكرر جزئيًا من صفحة 1، فتُعلَّم noindex,follow —
// تبقى قابلة للزحف (follow) لكن لا تُفهرَس بشكل منفصل يُشتت قيمة الصفحة الرئيسية فمحركات البحث.
export async function generateMetadata({ searchParams }: ProductsPageProps): Promise<Metadata> {
  const { page: pageParam, category: categorySlug } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  let title = "المنتجات";
  let description =
    "تصفح كل منتجات Store DZ: إلكترونيات وغادجات، أزياء وإكسسوارات، ومنتجات منزلية أصلية 100% بأسعار مناسبة وتوصيل لكل الجزائر.";
  let path = "/products";

  if (categorySlug) {
    const categories = await getCategories();
    const category = categories.find((c) => c.slug === categorySlug);
    if (category) {
      title = `${category.name} — المنتجات`;
      description = `تصفح تشكيلة ${category.name} فـStore DZ: منتجات أصلية 100% بأسعار مناسبة وتوصيل لكل الجزائر.`;
      path = `/products?category=${categorySlug}`;
    }
  }

  const meta = buildMetadata({ title, description, path });
  if (page > 1) {
    meta.robots = { index: false, follow: true };
  }
  return meta;
}

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const { page: pageParam, category } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const [{ products, total }, categories] = await Promise.all([
    getPublishedProductsPage({ categorySlug: category, page }),
    getCategories(),
  ]);

  return (
    <div className="container-page py-10 md:py-14">
      <Breadcrumbs items={[{ name: "المنتجات", path: "/products" }]} />
      <SectionHeading
        as="h1"
        eyebrow="كل المنتجات"
        title="تشكيلتنا الكاملة"
        description="اختر من بين تشكيلة متنوعة من المنتجات الأصلية، واطلب مباشرة عبر واتساب."
        className="mt-6"
      />
      <ProductGrid
        products={products}
        categories={categories}
        activeCategorySlug={category ?? ""}
        basePath="/products"
      />
      <StorefrontPagination
        page={page}
        pageSize={PRODUCTS_PAGE_SIZE}
        total={total}
        basePath="/products"
        extraParams={category ? { category } : {}}
      />
    </div>
  );
}
