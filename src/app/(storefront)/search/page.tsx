import type { Metadata } from "next";
import Link from "next/link";
import Breadcrumbs from "@/components/shared/Breadcrumbs";
import SectionHeading from "@/components/shared/SectionHeading";
import ProductGrid from "@/components/commerce/ProductGrid";
import StorefrontPagination from "@/components/shared/StorefrontPagination";
import { searchPublishedProducts, PRODUCTS_PAGE_SIZE } from "@/lib/storefrontData";

export const metadata: Metadata = { robots: { index: false, follow: true } };

type SearchPageProps = { searchParams: Promise<{ q?: string; page?: string }> };

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q = "", page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const { products, total } = await searchPublishedProducts(q, { page });

  return (
    <div className="container-page py-10 md:py-14">
      <Breadcrumbs items={[{ name: "نتائج البحث", path: "/search" }]} />
      <SectionHeading
        as="h1"
        eyebrow="نتائج البحث"
        title={q ? `نتائج البحث عن "${q}"` : "البحث"}
        description={
          q ? `${total} ${total === 1 ? "منتج" : "منتجات"} مطابقة` : "اكتب كلمة في مربع البحث أعلى الصفحة."
        }
        className="mt-6"
      />
      {q && products.length === 0 ? (
        <p className="text-center text-cream-dim py-16">
          لا توجد نتائج مطابقة لـ &quot;{q}&quot; — جرّب كلمة أخرى أو تصفّح{" "}
          <Link href="/products" className="text-gold hover:underline">
            كل المنتجات
          </Link>
          .
        </p>
      ) : (
        <>
          <ProductGrid products={products} categories={[]} showFilter={false} />
          <StorefrontPagination
            page={page}
            pageSize={PRODUCTS_PAGE_SIZE}
            total={total}
            basePath="/search"
            extraParams={q ? { q } : {}}
          />
        </>
      )}
    </div>
  );
}
