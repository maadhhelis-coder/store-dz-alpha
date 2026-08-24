import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import BrandImage from "@/components/brand/BrandImage";
import { getPublishedFunnelBySlug, incrementFunnelViews } from "@/server/services/funnelsService";
import { mapProduct, getRelatedProducts } from "@/lib/storefrontData";
import TrustBadgeStrip from "@/components/trust/TrustBadgeStrip";
import GuaranteeCard from "@/components/trust/GuaranteeCard";
import FunnelCtaButton from "@/components/order/FunnelCtaButton";
import ProductDetail from "@/components/commerce/ProductDetail";
import CreativeViewTracker from "@/components/tracking/CreativeViewTracker";
import RelatedProducts from "@/components/commerce/RelatedProducts";
import { formatPrice } from "@/lib/format";
import { buildMetadata } from "@/lib/seo";

type FunnelPageProps = {
  params: Promise<{ slug: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: FunnelPageProps): Promise<Metadata> {
  const { slug } = await params;
  const funnel = await getPublishedFunnelBySlug(slug);
  if (!funnel) return {};

  const meta = buildMetadata({
    title: funnel.title,
    description: funnel.subheadline ?? funnel.headline,
    path: `/lp/${funnel.slug}`,
    image: funnel.heroImageUrl ?? funnel.product.images[0]?.url,
    type: "product",
  });
  // صفحات الهبوط مبنية للحملات الإعلانية المدفوعة، لا للاكتشاف العضوي — تُستثنى من
  // الفهرسة دائمًا لتفادي تنافسها مع صفحة المنتج الأصلية (خصوصًا pageType: "product_page"
  // الذي يعرض نفس محتوى المنتج حرفيًا على رابط مختلف).
  meta.robots = { index: false, follow: true };
  return meta;
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

export default async function FunnelPage({ params }: FunnelPageProps) {
  const { slug } = await params;
  const funnel = await getPublishedFunnelBySlug(slug);
  if (!funnel) notFound();

  const product = mapProduct(funnel.product);

  await incrementFunnelViews(funnel.id);

  if (funnel.pageType === "product_page") {
    const related = await getRelatedProducts(product);
    return (
      <div className="container-page py-10 md:py-14">
        <ProductDetail product={product} />
        <RelatedProducts products={related} />
      </div>
    );
  }

  const bullets = asStringList(funnel.bullets);
  const heroImage = funnel.heroImageUrl || product.images[0];

  return (
    <div className="bg-black">
      <CreativeViewTracker pageKind="landing" productSlug={product.slug} productName={product.name} price={product.price} />
      <section className="container-page py-8 md:py-14">
        <div className="grid md:grid-cols-2 gap-8 md:gap-12 items-center">
          <div className="relative aspect-square rounded-2xl overflow-hidden gold-border">
            <BrandImage
              src={heroImage}
              alt={funnel.headline}
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover"
              priority
            />
          </div>

          <div>
            <h1 className="font-display text-2xl md:text-4xl font-bold text-cream leading-tight">
              {funnel.headline}
            </h1>
            {funnel.subheadline && (
              <p className="text-cream-dim mt-4 text-base md:text-lg leading-relaxed">
                {funnel.subheadline}
              </p>
            )}

            {bullets.length > 0 && (
              <ul className="mt-6 space-y-2.5">
                {bullets.map((bullet, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm md:text-base text-cream-dim">
                    <CheckCircle2 className="w-5 h-5 text-gold shrink-0 mt-0.5" />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex items-center gap-3 mt-6">
              <span className="text-2xl md:text-3xl font-bold text-gold">
                {formatPrice(product.price)}
              </span>
              {product.oldPrice && (
                <span className="text-cream-dim/80 line-through text-lg">
                  {formatPrice(product.oldPrice)}
                </span>
              )}
            </div>

            <div className="mt-6">
              <FunnelCtaButton product={product} ctaText={funnel.ctaText} />
            </div>
            <p className="text-[11px] text-cream-dim/80 text-center mt-2">
              الدفع عند الاستلام — لا حاجة لأي دفع الآن
            </p>
          </div>
        </div>

        <div className="mt-10 md:mt-14">
          <TrustBadgeStrip />
        </div>

        <div className="mt-8 max-w-xl mx-auto">
          <GuaranteeCard />
        </div>
      </section>

      {/* قسم الشهادات مُعطَّل مؤقتًا — راجع التعليق في page.tsx (الصفحة الرئيسية) للسبب. */}

      <div className="sticky bottom-0 inset-x-0 z-40 bg-black/95 backdrop-blur border-t border-gold/15 p-3 md:hidden">
        <FunnelCtaButton product={product} ctaText={funnel.ctaText} />
      </div>
    </div>
  );
}
