import Link from "next/link";
import BrandImage from "@/components/brand/BrandImage";
import OrderNowButton from "@/components/order/OrderNowButton";
import type { Product } from "@/data/products";
import { formatPrice } from "@/lib/format";

type ProductCardProps = {
  product: Product;
  priority?: boolean;
};

export default function ProductCard({ product, priority = false }: ProductCardProps) {
  return (
    <div className="group flex flex-col rounded-xl overflow-hidden bg-ink gold-border hover:gold-glow transition-shadow">
      <Link
        href={`/products/${product.slug}`}
        className="relative block aspect-square overflow-hidden"
      >
        <BrandImage
          src={product.images[0]}
          alt={`${product.name} — Store DZ`}
          fill
          priority={priority}
          className="object-cover group-hover:scale-105 transition-transform duration-300"
          sizes="(max-width: 768px) 50vw, 25vw"
        />
        {product.badge && (
          <span className="absolute top-3 start-3 gold-gradient text-ink text-xs font-bold px-2.5 py-1 rounded-full">
            {product.badge}
          </span>
        )}
      </Link>

      <div className="p-4 flex flex-col gap-2 flex-1">
        <Link href={`/products/${product.slug}`}>
          <h3 className="font-display font-semibold text-cream text-sm md:text-base line-clamp-1 hover:text-gold transition-colors">
            {product.name}
          </h3>
        </Link>
        <p className="text-xs md:text-sm text-cream-dim line-clamp-2 flex-1">
          {product.shortDescription}
        </p>
        <div className="flex items-center gap-2">
          <span className="text-gold font-bold">{formatPrice(product.price)}</span>
          {product.oldPrice && (
            <>
              <span className="text-cream-dim/80 text-xs line-through">
                {formatPrice(product.oldPrice)}
              </span>
              <span className="text-[11px] font-bold text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded">
                -{Math.round(((product.oldPrice - product.price) / product.oldPrice) * 100)}%
              </span>
            </>
          )}
        </div>
        {product.lowStockCount !== undefined && (
          <p className="text-[11px] font-semibold text-orange-400">
            بقي {product.lowStockCount} {product.lowStockCount === 1 ? "قطعة" : "قطع"} فقط!
          </p>
        )}
        <OrderNowButton product={product} variant="inline" className="mt-1" />
      </div>
    </div>
  );
}
