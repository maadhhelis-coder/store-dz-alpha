import Image from "next/image";
import { sanitizeProductHtml } from "@/lib/sanitizeHtml";
import ProductGallery from "@/components/commerce/ProductGallery";
import OrderForm from "@/components/order/OrderForm";
import OrderNowButton from "@/components/order/OrderNowButton";
import TrustIconsRow from "@/components/trust/TrustIconsRow";
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
    <div>
      <CreativeViewTracker
        pageKind="product"
        productSlug={product.slug}
        productName={product.name}
        price={product.price}
      />

      <div className="grid items-start gap-6 md:grid-cols-2 md:gap-8">
        {/* عمود الصور يثبت مكانه حتى ينتهي كل ما في الإطار المجاور (طلب صريح) —
            sticky على الحاسوب فقط؛ على الهاتف العمودان فوق بعضهما أصلًا. */}
        <div className="md:sticky md:top-24 md:self-start">
          <ProductGallery images={product.images} productName={product.name} />
        </div>

        {/* الإطار المستطيلي الكبير — خطوطه صفراء باردة، تمييزًا عن الذهبي الدافئ
            لإطارات الصور بجانبه. يضم كل شيء: الاسم والوصف المختصر والسعر وصورة
            "تسوق بثقة" والاستمارة وصورة الخدمات والوصف الكامل. */}
        <div className="gold-border-cool gold-glow-cool rounded-2xl p-4 md:p-6 space-y-6">
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
                  {/* مستطيل أصفر والكتابة بيضاء (طلب صريح) */}
                  <span className="rounded-md bg-gold px-2.5 py-1 text-xs font-bold text-white">
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

          {/* "تسوق بثقة" — في إطار ذهبي دافئ، نفس لون إطار الاستمارة تحته */}
          <div className="mx-auto w-full max-w-lg gold-border rounded-xl overflow-hidden">
            <Image
              src="/images/trust/features-grid.png"
              alt="الدفع عند الاستلام، تفقد المنتج قبل الدفع، توصيل سريع، استبدال أو استرجاع المنتج"
              width={1536}
              height={1024}
              sizes="(min-width: 768px) 512px, 100vw"
              className="hidden md:block h-auto w-full"
            />
            <Image
              src="/images/trust/features-stack.png"
              alt="الدفع عند الاستلام، تفقد المنتج قبل الدفع، توصيل سريع، استبدال أو استرجاع المنتج"
              width={1125}
              height={1406}
              sizes="100vw"
              className="md:hidden h-auto w-full"
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

              {/* شريط الخدمات بنفس عرض إطار الاستمارة بالضبط (max-w-lg) */}
              <div className="mx-auto w-full max-w-lg">
                <Image
                  src="/images/trust/service-strip.png"
                  alt="التوصيل، الإرجاع، خدمة العملاء، الدفع عند الاستلام"
                  width={2060}
                  height={763}
                  sizes="(min-width: 768px) 512px, 100vw"
                  className="h-auto w-full rounded-xl"
                />
              </div>
            </>
          )}

          {/* الوصف الكامل — موسَّط وبعرض مقروء، لا أسطر طويلة (طلب صريح) */}
          <div
            className="mx-auto w-full max-w-lg text-center text-sm text-cream-dim leading-relaxed [&_p]:mb-3 [&_strong]:text-cream [&_ul]:list-none [&_ul]:pr-0 [&_h2]:font-display [&_h2]:text-gold [&_h2]:font-semibold [&_h2]:mt-6 [&_h2]:mb-2"
            dangerouslySetInnerHTML={{ __html: sanitizeProductHtml(product.longDescriptionHtml) }}
          />
        </div>
      </div>

      {/* الأيقونات تظهر بعد أن ينتهي العمودان — صفحة المنتج وحدها */}
      <TrustIconsRow />

      {/* شريط «اطلب الآن» وحده أسفل الصفحة: ثابت لا يتحرك ولا يختفي مع التمرير
          (طلب صريح). «تأكيد الطلبية» شيء آخر — داخل الاستمارة داخل الإطار. */}
      <div className="fixed bottom-0 inset-x-0 z-40 bg-black/95 backdrop-blur border-t border-gold/15 p-2.5">
        <div className="container-page flex items-center gap-3">
          <span className="shrink-0 text-lg font-bold text-gold">{formatPrice(product.price)}</span>
          <OrderNowButton product={product} variant="sticky-bar" target="form" className="flex-1" />
        </div>
      </div>
    </div>
  );
}
