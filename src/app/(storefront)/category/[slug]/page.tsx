import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Breadcrumbs from "@/components/shared/Breadcrumbs";
import SectionHeading from "@/components/shared/SectionHeading";
import ProductGrid from "@/components/commerce/ProductGrid";
import StorefrontPagination from "@/components/shared/StorefrontPagination";
import WhatsAppButton from "@/components/shared/WhatsAppButton";
import { getCategories, getCategoryBySlug, getPublishedProductsPage, PRODUCTS_PAGE_SIZE } from "@/lib/storefrontData";
import { buildMetadata } from "@/lib/seo";
import { buildCategoryMessage } from "@/lib/whatsapp";

type CategoryPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
};

export async function generateStaticParams() {
  const categories = await getCategories();
  return categories.map((category) => ({ slug: category.slug }));
}

export async function generateMetadata({
  params,
  searchParams,
}: CategoryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const { page: pageParam } = await searchParams;
  const category = await getCategoryBySlug(slug);
  if (!category) return {};

  const meta = buildMetadata({
    title: category.name,
    description: category.description,
    path: `/category/${category.slug}`,
    image: category.image,
  });
  if (Math.max(1, Number(pageParam) || 1) > 1) {
    meta.robots = { index: false, follow: true };
  }
  return meta;
}

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const { slug } = await params;
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const category = await getCategoryBySlug(slug);
  if (!category) notFound();

  const [{ products: categoryProducts, total }, categories] = await Promise.all([
    getPublishedProductsPage({ categorySlug: category.slug, page }),
    getCategories(),
  ]);

  return (
    <div className="container-page py-10 md:py-14">
      <Breadcrumbs
        items={[{ name: category.name, path: `/category/${category.slug}` }]}
      />
      <div className="flex items-end justify-between gap-4 flex-wrap mt-6">
        <SectionHeading
          as="h1"
          eyebrow="تصنيف"
          title={category.name}
          description={category.description}
        />
        <WhatsAppButton
          variant="pill"
          message={buildCategoryMessage(category)}
          label={`اسأل عن ${category.name}`}
          className="mb-8"
        />
      </div>
      <ProductGrid
        products={categoryProducts}
        categories={categories}
        showFilter={false}
      />
      <StorefrontPagination
        page={page}
        pageSize={PRODUCTS_PAGE_SIZE}
        total={total}
        basePath={`/category/${category.slug}`}
      />
    </div>
  );
}
