import Link from "next/link";
import SectionHeading from "@/components/shared/SectionHeading";
import ProductCard from "@/components/commerce/ProductCard";
import { getFeaturedProducts } from "@/lib/storefrontData";

export default async function FeaturedProducts() {
  const items = await getFeaturedProducts(8);

  return (
    <section id="best-sellers" className="container-page py-14 md:py-20 scroll-mt-24">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <SectionHeading
          eyebrow="الأكثر طلبًا"
          title="منتجات مختارة لك"
          description="تشكيلة من أفضل منتجاتنا مبيعًا وأحدثها وصولًا."
        />
        <Link
          href="/products"
          className="text-sm font-semibold text-gold hover:underline mb-8"
        >
          عرض كل المنتجات ←
        </Link>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
        {items.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  );
}
