import PrefetchLink from "@/components/shared/PrefetchLink";
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
    // البطاقة هي «الإطار الكبير» بخطوطه الذهبية — يبقى كما هو.
    <div className="group flex flex-col rounded-xl overflow-hidden bg-ink gold-border hover:gold-glow transition-shadow">
      {/* إطار الصورة بداخله: بلا أي خطوط ذهبية (طلب صريح) — الإطار هو الصورة نفسها.
          object-contain لا cover: صور المنتج طولية (1792×2400) وcover كان يقصّ
          أعلاها وأسفلها فلا تظهر التفاصيل كاملة. */}
      <PrefetchLink
        href={`/products/${product.slug}`}
        className="relative block aspect-square overflow-hidden bg-ink"
      >
        <BrandImage
          src={product.images[0]}
          alt={`${product.name} — Store DZ`}
          fill
          priority={priority}
          className="object-contain transition-transform duration-300 group-hover:scale-105"
          sizes="(max-width: 768px) 50vw, 25vw"
        />
        {product.badge && (
          <span className="absolute top-3 start-3 gold-gradient text-ink text-xs font-bold px-2.5 py-1 rounded-full">
            {product.badge}
          </span>
        )}
      </PrefetchLink>

      <div className="p-4 flex flex-col gap-2 flex-1">
        <PrefetchLink href={`/products/${product.slug}`}>
          <h3 className="font-display font-semibold text-cream text-sm md:text-base line-clamp-1 hover:text-gold transition-colors">
            {product.name}
          </h3>
        </PrefetchLink>
        <p className="text-xs md:text-sm text-cream-dim line-clamp-2 flex-1">
          {product.shortDescription}
        </p>
        {/* السعر الرسمي، وتحته السعر القديم مشطوبًا (طلب صريح) */}
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-gold font-bold text-lg">{formatPrice(product.price)}</span>
          {product.oldPrice && (
            <span className="text-cream-dim/80 text-sm line-through">
              {formatPrice(product.oldPrice)}
            </span>
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
