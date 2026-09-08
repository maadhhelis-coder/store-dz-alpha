import Image from "next/image";
import { CheckCircle2 } from "lucide-react";
import { sanitizeProductHtml } from "@/lib/sanitizeHtml";
import ProductGallery from "@/components/commerce/ProductGallery";
import OrderForm from "@/components/order/OrderForm";
import StickyOrderBar from "@/components/commerce/StickyOrderBar";
import CreativeViewTracker from "@/components/tracking/CreativeViewTracker";
import type { Product } from "@/data/products";
import { formatPrice } from "@/lib/format";

type ProductDetailProps = {
  product: Product;
  orderSettings?: {
    thankYouMessage?: string | null;
    thankYouPageUrl?: string | null;
    privacyPolicyText?: string | null;
  };
};

export default function ProductDetail({ product, orderSettings }: ProductDetailProps) {
  const discount = product.oldPrice
    ? Math.round(((product.oldPrice - product.price) / product.oldPrice) * 100)
    : null;

  return (
    <div className="space-y-10">
      <CreativeViewTracker
        pageKind="product"
        productSlug={product.slug}
        productName={product.name}
        price={product.price}
      />

      <div className="grid md:grid-cols-2 gap-10">
        <ProductGallery images={product.images} productName={product.name} />

        <div>
          {product.badge && (
            <span className="inline-block gold-gradient text-ink text-xs font-bold px-3 py-1 rounded-full mb-3">
              {product.badge}
            </span>
          )}
          <h1 className="font-display text-2xl md:text-3xl font-bold text-cream">{product.name}</h1>
          <p className="text-cream-dim mt-3 leading-relaxed">{product.shortDescription}</p>

          <div className="flex flex-wrap items-center gap-3 mt-5">
            <span className="text-2xl font-bold text-gold">{formatPrice(product.price)}</span>
            {product.oldPrice && (
              <>
                <span className="text-cream-dim/80 line-through">{formatPrice(product.oldPrice)}</span>
                <span className="text-xs font-bold text-red-400 bg-red-400/10 px-2 py-0.5 rounded">
                  خصم بقيمة {discount}%
                </span>
              </>
            )}
          </div>

          {product.lowStockCount !== undefined && (
            <p className="text-sm font-semibold text-orange-400 mt-3">
              ⚠️ بقي {product.lowStockCount} {product.lowStockCount === 1 ? "قطعة" : "قطع"} فقط بالمخزون
            </p>
          )}
        </div>
      </div>

      {/* ضمانات المتجر — نسختان لأن الأصل تصميم واحد لكل مقاس: شبكة 2×2 عريضة
          للحاسوب، وعمود مرصوص للهاتف. لا قصّ ولا تشويه لأي منهما. */}
      <div className="relative mx-auto w-full max-w-3xl">
        <Image
          src="/images/trust/features-grid.png"
          alt="الدفع عند الاستلام، تفقد المنتج قبل الدفع، توصيل سريع، استبدال أو استرجاع المنتج"
          width={1536}
          height={1024}
          sizes="(min-width: 768px) 768px, 100vw"
          className="hidden md:block h-auto w-full rounded-xl"
        />
        <Image
          src="/images/trust/features-stack.png"
          alt="الدفع عند الاستلام، تفقد المنتج قبل الدفع، توصيل سريع، استبدال أو استرجاع المنتج"
          width={1125}
          height={1406}
          sizes="100vw"
          className="md:hidden h-auto w-full rounded-xl"
        />
      </div>

      {product.inStock && (
        <>
          <OrderForm
            product={product}
            pageKind="product"
            thankYouMessage={orderSettings?.thankYouMessage}
            thankYouPageUrl={orderSettings?.thankYouPageUrl}
            privacyPolicyText={orderSettings?.privacyPolicyText}
          />

          {/* شريط الخدمات مباشرة تحت الاستمارة */}
          <div className="mx-auto w-full max-w-3xl">
            <Image
              src="/images/trust/service-strip.png"
              alt="التوصيل، الإرجاع، خدمة العملاء، الدفع عند الاستلام"
              width={2060}
              height={763}
              sizes="(min-width: 768px) 768px, 100vw"
              className="h-auto w-full rounded-xl"
            />
          </div>
        </>
      )}

      {/* الوصف الكامل — بلا عنوان "وصف المنتج"، تحت شريط الخدمات مباشرة */}
      <div
        className="text-sm text-cream-dim leading-relaxed [&_p]:mb-3 [&_strong]:text-cream [&_ul]:list-disc [&_ul]:pr-5 [&_h2]:font-display [&_h2]:text-gold [&_h2]:font-semibold [&_h2]:mt-6 [&_h2]:mb-2"
        dangerouslySetInnerHTML={{ __html: sanitizeProductHtml(product.longDescriptionHtml) }}
      />

      <div className="space-y-2">
        <h2 className="font-display font-semibold text-gold">كيفية الاستعمال</h2>
        <ul className="space-y-2">
          {product.howToUse.map((step, index) => (
            <li key={index} className="flex items-start gap-2 text-sm text-cream-dim">
              <CheckCircle2 className="w-4 h-4 text-gold shrink-0 mt-0.5" />
              <span>{step}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* يظهر أيضًا للمنتج النافد: الزر معطَّل بنص "نفذ من المخزون"، وهو الإشارة
          الوحيدة المتبقية للتوفّر بعد حذف سطر "متوفر حاليًا". */}
      <StickyOrderBar product={product} />
    </div>
  );
}
