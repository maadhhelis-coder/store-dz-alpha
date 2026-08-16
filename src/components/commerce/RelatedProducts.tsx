import SectionHeading from "@/components/shared/SectionHeading";
import ProductCard from "@/components/commerce/ProductCard";
import type { Product } from "@/data/products";

type RelatedProductsProps = {
  products: Product[];
};

export default function RelatedProducts({ products }: RelatedProductsProps) {
  if (products.length === 0) return null;

  return (
    <section className="container-page py-14 md:py-20">
      <SectionHeading eyebrow="قد يعجبك أيضًا" title="منتجات ذات صلة" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  );
}
