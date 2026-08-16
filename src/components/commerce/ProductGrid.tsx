import Link from "next/link";
import ProductCard from "@/components/commerce/ProductCard";
import type { Product } from "@/data/products";
import type { Category } from "@/data/categories";
import { cn } from "@/lib/utils";

type ProductGridProps = {
  products: Product[];
  categories?: Category[];
  showFilter?: boolean;
  // التصنيف النشط حاليًا (من رابط الصفحة) — الفلترة نفسها تحدث فالسيرفر (page.tsx)،
  // هذا المكوّن فقط يعرض المنتجات الجاهزة ويبني روابط التصنيفات.
  activeCategorySlug?: string;
  basePath?: string;
};

export default function ProductGrid({
  products,
  categories = [],
  showFilter = true,
  activeCategorySlug = "",
  basePath = "/products",
}: ProductGridProps) {
  return (
    <div>
      {showFilter && categories.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          <Link
            href={basePath}
            className={cn(
              "px-4 py-1.5 rounded-full text-sm border transition-colors",
              activeCategorySlug === ""
                ? "gold-gradient text-ink border-transparent font-semibold"
                : "border-gold/30 text-cream-dim hover:text-gold",
            )}
          >
            الكل
          </Link>
          {categories.map((category) => (
            <Link
              key={category.slug}
              href={`${basePath}?category=${category.slug}`}
              className={cn(
                "px-4 py-1.5 rounded-full text-sm border transition-colors",
                activeCategorySlug === category.slug
                  ? "gold-gradient text-ink border-transparent font-semibold"
                  : "border-gold/30 text-cream-dim hover:text-gold",
              )}
            >
              {category.name}
            </Link>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
        {products.map((product, index) => (
          <ProductCard key={product.id} product={product} priority={index < 4} />
        ))}
      </div>

      {products.length === 0 && (
        <p className="text-center text-cream-dim py-12">
          لا توجد منتجات في هذا التصنيف حاليًا.
        </p>
      )}
    </div>
  );
}
