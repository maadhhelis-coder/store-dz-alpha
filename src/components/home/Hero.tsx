import Link from "next/link";
import BrandImage from "@/components/brand/BrandImage";
import { SITE_TAGLINE, WILAYA_COUNT } from "@/data/site";

export default function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-gold/15">
      <div className="container-page grid md:grid-cols-2 gap-10 items-center py-14 md:py-24">
        <div>
          <span className="inline-block text-xs font-semibold tracking-wider text-gold uppercase mb-4">
            Store DZ — الجزائر
          </span>
          <h1 className="font-display text-3xl md:text-5xl font-extrabold text-cream leading-tight">
            منتجات تختارها بثقة، <span className="gold-gradient-text">وتوصلك أينما كنت</span>
          </h1>
          <p className="text-cream-dim mt-5 text-base md:text-lg leading-relaxed">
            {SITE_TAGLINE}. اكتشف تشكيلتنا من الإلكترونيات، الأزياء، ومنتجات
            المنزل، واطلب مباشرة من الموقع بخطوة واحدة، مع توصيل لـ {WILAYA_COUNT} ولاية
            ودفع عند الاستلام.
          </p>
          <div className="flex flex-wrap items-center gap-4 mt-8">
            <Link
              href="#best-sellers"
              className="gold-gradient text-ink font-bold px-6 py-3.5 rounded-xl hover:brightness-110 transition"
            >
              تصفح المنتجات
            </Link>
          </div>
        </div>

        <div className="relative aspect-[16/10] rounded-2xl overflow-hidden gold-border">
          <BrandImage
            src="/images/banners/hero-shop-now-banner.png"
            alt="تسوق الآن من متجر Store DZ الإلكتروني"
            fill
            priority
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 50vw"
          />
        </div>
      </div>
    </section>
  );
}
