import type { Metadata } from "next";
import Link from "next/link";
import Hero from "@/components/home/Hero";
import BrandImage from "@/components/brand/BrandImage";
import SectionHeading from "@/components/shared/SectionHeading";
import FAQAccordion from "@/components/faq/FAQAccordion";
import { faqItems } from "@/data/faq";
import JsonLd from "@/components/shared/JsonLd";
import { buildMetadata, websiteJsonLd } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "تسوق إلكترونيات وأزياء ومنتجات منزلية أصلية",
  description:
    "متجرك الإلكتروني في الجزائر لمنتجات أصلية، بتوصيل سريع لكل الولايات ودفع عند الاستلام.",
  path: "/",
});

const HIGHLIGHT_BADGES = [
  { src: "/images/badges/shipping-refund.png", alt: "الشحن — ضمان استعادة الأموال" },
  { src: "/images/badges/real-guarantee.png", alt: "ضمان حقيقي" },
  { src: "/images/badges/after-sales.png", alt: "خدمة ما بعد البيع" },
  { src: "/images/badges/cash-on-delivery.png", alt: "الدفع عند الاستلام" },
] as const;

export default function Home() {
  const previewFaq = faqItems.slice(0, 6);

  return (
    <>
      <JsonLd data={websiteJsonLd()} />
      <Hero />

      <section className="container-page py-10 text-center">
        <Link
          href="/products"
          className="font-display text-2xl md:text-3xl font-extrabold text-cream hover:text-gold transition-colors"
        >
          المنتجات
        </Link>
      </section>

      <section className="container-page py-14 md:py-20">
        <SectionHeading eyebrow="لماذا Store DZ" title="ما يميزنا" align="center" />
        <div className="grid grid-cols-2 gap-4 md:gap-6 max-w-xl mx-auto">
          {HIGHLIGHT_BADGES.map((badge) => (
            <div key={badge.src} className="rounded-xl overflow-hidden gold-border">
              <BrandImage
                src={badge.src}
                alt={badge.alt}
                width={1080}
                height={1440}
                className="w-full h-auto"
                sizes="(max-width: 768px) 45vw, 280px"
              />
            </div>
          ))}
        </div>
      </section>

      <section className="container-page py-14 md:py-20">
        <SectionHeading
          eyebrow="الأسئلة الشائعة"
          title="عندك سؤال؟ عندنا الجواب"
          align="center"
        />
        <div className="max-w-2xl mx-auto">
          <FAQAccordion items={previewFaq} />
          <div className="text-center mt-6">
            <Link href="/faq" className="text-sm font-semibold text-gold hover:underline">
              عرض كل الأسئلة الشائعة ←
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
