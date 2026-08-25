import type { Metadata } from "next";
import Link from "next/link";
import Hero from "@/components/home/Hero";
import BrandImage from "@/components/brand/BrandImage";
import SectionHeading from "@/components/shared/SectionHeading";
import JsonLd from "@/components/shared/JsonLd";
import { buildMetadata, websiteJsonLd } from "@/lib/seo";

// عنوان قصير صراحة بطلب المتجر — Google كان يعرض العنوان الأطول السابق كاملاً فنتائج
// البحث، والمطلوب الآن هو "Store DZ" فقط. title: { absolute } ضروري هنا تحديدًا (وليس نص
// عادي) — اكتُشف فعليًا محليًا: نص عادي "Store DZ" يمتلئ به %s فقالب العنوان الجذري
// ("%s | Store DZ")، فيظهر "Store DZ | Store DZ" مكررًا بدل "Store DZ" فقط. absolute
// يتجاوز القالب صراحة، بلا التأثير على باقي الصفحات (كل صفحة أخرى تحتاج فعلاً لاحقة
// "| Store DZ" العادية، فتبقى title نصًا عاديًا فيها).
export const metadata: Metadata = {
  ...buildMetadata({
    title: "Store DZ",
    description:
      "متجرك الإلكتروني في الجزائر لمنتجات أصلية، بتوصيل سريع لكل الولايات ودفع عند الاستلام.",
    path: "/",
  }),
  title: { absolute: "Store DZ" },
};

export default function Home() {
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

      {/* استُبدلت شبكة الشارات الأربعة بصورة واحدة (طلب صريح) — الصورة نفسها تحمل عنوان
          "ما يميزنا" مرسومًا بداخلها، فلا حاجة لـ SectionHeading مكرِّر هنا. */}
      <section className="container-page py-10 md:py-14">
        <div className="max-w-2xl mx-auto rounded-2xl overflow-hidden gold-border">
          <BrandImage
            src="/images/highlights/ma-yumayyizna.png"
            alt="ما يميزنا: ضمان حقيقي، الشحن إلى 69 ولاية، الدفع عند الاستلام، خدمة ما بعد البيع"
            width={1536}
            height={1024}
            className="w-full h-auto"
            sizes="(max-width: 768px) 100vw, 672px"
          />
        </div>
      </section>
    </>
  );
}
