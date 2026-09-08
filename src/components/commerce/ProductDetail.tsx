import { CheckCircle2 } from "lucide-react";
import { sanitizeProductHtml } from "@/lib/sanitizeHtml";
import ProductGallery from "@/components/commerce/ProductGallery";
import OrderNowButton from "@/components/order/OrderNowButton";
import OrderForm from "@/components/order/OrderForm";
import TrustBadgeStrip from "@/components/trust/TrustBadgeStrip";
import GuaranteeCard from "@/components/trust/GuaranteeCard";
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
  return (
    <div className="grid md:grid-cols-2 gap-10">
      <CreativeViewTracker pageKind="product" productSlug={product.slug} productName={product.name} price={product.price} />
      <ProductGallery images={product.images} productName={product.name} />

      <div>
        {product.badge && (
          <span className="inline-block gold-gradient text-ink text-xs font-bold px-3 py-1 rounded-full mb-3">
            {product.badge}
          </span>
        )}
        <h1 className="font-display text-2xl md:text-3xl font-bold text-cream">
          {product.name}
        </h1>
        <p className="text-cream-dim mt-3 leading-relaxed">
          {product.shortDescription}
        </p>

        <div className="flex items-center gap-3 mt-5">
          <span className="text-2xl font-bold text-gold">
            {formatPrice(product.price)}
          </span>
          {product.oldPrice && (
            <>
              <span className="text-cream-dim/80 line-through">
                {formatPrice(product.oldPrice)}
              </span>
              <span className="text-xs font-bold text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded">
                -{Math.round(((product.oldPrice - product.price) / product.oldPrice) * 100)}%
              </span>
            </>
          )}
        </div>

        <p className="text-sm text-cream-dim mt-2">
          {product.inStock ? "متوفر حاليًا" : "غير متوفر مؤقتًا"}
        </p>
        {product.lowStockCount !== undefined && (
          <p className="text-sm font-semibold text-orange-400 mt-1">
            ⚠️ بقي {product.lowStockCount} {product.lowStockCount === 1 ? "قطعة" : "قطع"} فقط بالمخزون
          </p>
        )}

        <div className="mt-6">
          <OrderNowButton product={product} variant="primary-large" target="form" />
        </div>

        <div className="mt-8 space-y-3">
          <h2 className="font-display font-semibold text-gold">وصف المنتج</h2>
          <div
            className="text-sm text-cream-dim leading-relaxed [&_p]:mb-3 [&_strong]:text-cream [&_ul]:list-disc [&_ul]:pr-5"
            dangerouslySetInnerHTML={{ __html: sanitizeProductHtml(product.longDescriptionHtml) }}
          />
        </div>

        <div className="mt-8 space-y-2">
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
      </div>

      <div className="md:col-span-2 mt-4">
        <TrustBadgeStrip />
      </div>

      <div className="md:col-span-2 mt-4">
        <GuaranteeCard />
      </div>

      {/* الاستمارة مدمجة في الصفحة نفسها — الزبون ينزل فيجدها، ولا نافذة تنبثق.
          لا تُعرض لمنتج نافد: استمارة لطلب لا يمكن تنفيذه. */}
      {product.inStock && (
        <>
          <div className="md:col-span-2 mt-10">
            <h2 className="font-display text-lg font-bold text-gold text-center mb-4">
              أكمل طلبك الآن
            </h2>
            <OrderForm
              product={product}
              pageKind="product"
              thankYouMessage={orderSettings?.thankYouMessage}
              thankYouPageUrl={orderSettings?.thankYouPageUrl}
              privacyPolicyText={orderSettings?.privacyPolicyText}
            />
          </div>

          {/* شريط ثابت لا يختفي مع التمرير على أي مقاس (طلب صريح) — النزول
              للاستمارة. الصفحة تحمل حشوًا سفليًا يقابل ارتفاعه فلا يغطي محتوى. */}
          <div className="fixed bottom-0 inset-x-0 z-40 bg-black/95 backdrop-blur border-t border-gold/15 p-3">
            <div className="container-page">
              <OrderNowButton product={product} variant="primary-large" target="form" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
