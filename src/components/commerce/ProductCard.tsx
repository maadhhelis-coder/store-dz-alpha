import PrefetchLink from "@/components/shared/PrefetchLink";
import BrandImage from "@/components/brand/BrandImage";
import OrderNowButton from "@/components/order/OrderNowButton";
import type { Product } from "@/data/products";
import { formatPrice } from "@/lib/format";

type ProductCardProps = {
  product: Product;
  priority?: boolean;
};

// صورة البطاقة في المتجر فقط (طلب صريح: لا تدخل معرض صفحة المنتج) — ملف في public/images/cards
// باسم الـslug. ponytail: خريطة ثابتة لمنتج واحد؛ خانة «صورة البطاقة» في لوحة التحكم عند
// تعدد المنتجات. بلا صورة مخصصة تُستعمل الصورة الأولى للمنتج.
const CARD_IMAGES: Record<string, string> = {
  "pack-douche-robinet": "/images/cards/pack-douche-robinet.jpg",
};

export function cardImage(product: Pick<Product, "slug" | "images">): string {
  return CARD_IMAGES[product.slug] ?? product.images[0];
}

export default function ProductCard({ product, priority = false }: ProductCardProps) {
  return (
    // البطاقة هي «الإطار الكبير» بخطوطه الذهبية اللامعة قليلًا (طلب صريح: توهج دائم لا عند المرور فقط).
    <div className="group flex flex-col rounded-xl overflow-hidden bg-ink gold-border gold-glow">
      {/* الصورة كاملة بلا قصّ ولا تكبير عند المرور، بإطارها الخاص الذهبي البارد الباهت غير اللامع
          (gold-border-cool) داخل إطار البطاقة اللامع — طلب صريح. */}
      <PrefetchLink
        href={`/products/${product.slug}`}
        className="relative block aspect-[3/4] overflow-hidden bg-ink m-3 rounded-lg gold-border-cool"
      >
        <BrandImage
          src={cardImage(product)}
          alt={`${product.name} — Store DZ`}
          fill
          priority={priority}
          className="object-contain"
          sizes="(max-width: 768px) 50vw, 25vw"
        />
      </PrefetchLink>

      <div className="p-4 flex flex-col gap-2 flex-1 text-center">
        {product.badge && (
          <span className="self-center gold-gradient text-ink text-xs font-bold px-2.5 py-1 rounded-full">
            {product.badge}
          </span>
        )}
        {/* الاسم كاملًا بلا قصّ، وبلا وصف مختصر تحته (طلب صريح) */}
        <PrefetchLink href={`/products/${product.slug}`}>
          <h3 className="font-display font-semibold text-cream text-sm md:text-base leading-relaxed hover:text-gold transition-colors">
            {product.name}
          </h3>
        </PrefetchLink>
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
