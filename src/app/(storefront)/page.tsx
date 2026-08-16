import type { Metadata } from "next";
import Link from "next/link";
import Hero from "@/components/home/Hero";
import CategoryTeasers from "@/components/home/CategoryTeasers";
import FeaturedProducts from "@/components/home/FeaturedProducts";
import BlogTeaser from "@/components/home/BlogTeaser";
import TrustBadgeStrip from "@/components/trust/TrustBadgeStrip";
import GuaranteeCard from "@/components/trust/GuaranteeCard";
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

export default function Home() {
  const previewFaq = faqItems.slice(0, 6);

  return (
    <>
      <JsonLd data={websiteJsonLd()} />
      <Hero />
      <div className="container-page">
        <TrustBadgeStrip />
      </div>

      <CategoryTeasers />
      <FeaturedProducts />

      <section className="container-page py-14 md:py-20 grid md:grid-cols-2 gap-8 items-start">
        <GuaranteeCard />
        <div>
          <SectionHeading
            eyebrow="لماذا Store DZ"
            title="تسوق بثقة تامة"
            description="نحن لا نكتفي ببيع المنتجات، بل نبني علاقة ثقة مع كل زبون عبر ضمان حقيقي، خدمة سريعة، ودعم متواصل قبل وبعد الشراء."
          />
          <ul className="space-y-3 text-sm text-cream-dim leading-relaxed">
            <li>✓ تواصل مباشر عبر واتساب مع فريقنا لأي استفسار قبل الشراء.</li>
            <li>✓ دفع عند الاستلام في جميع الطلبات، بدون أي مخاطرة.</li>
            <li>✓ توصيل يغطي كامل ولايات الجزائر.</li>
            <li>✓ خدمة ما بعد البيع متوفرة لمساعدتك في أي وقت.</li>
          </ul>
        </div>
      </section>

      {/* قسم الشهادات مُعطَّل مؤقتًا — كانت مراجعات مُلفَّقة بأسماء وتواريخ وهمية على متجر
          بلا زبائن حقيقيين بعد؛ يُعاد تفعيله (Testimonials from "@/components/social-proof/Testimonials")
          فور توفر تقييمات موثقة فعلية من زبائن حقيقيين. */}

      <BlogTeaser />

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
