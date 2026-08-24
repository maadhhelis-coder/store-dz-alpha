import BrandImage from "@/components/brand/BrandImage";

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
        </div>

        <div className="relative aspect-[16/10] rounded-2xl overflow-hidden gold-border">
          <BrandImage
            src="/images/banners/delivery-coverage-hero.png"
            alt="Store DZ — توصيل إلى 69 ولاية"
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
