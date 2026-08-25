import type { Metadata } from "next";
import Link from "next/link";
import Hero from "@/components/home/Hero";
import BrandImage from "@/components/brand/BrandImage";
import SectionHeading from "@/components/shared/SectionHeading";
import JsonLd from "@/components/shared/JsonLd";
import ProductGrid from "@/components/commerce/ProductGrid";
import { buildMetadata, websiteJsonLd } from "@/lib/seo";
import { getPublishedProductsPage } from "@/lib/storefrontData";

// عدد المنتجات المعروضة فمعاينة الصفحة الرئيسية — طلب صريح: توفير "بلاصة" حقيقية تحت
// عنوان "المنتجات" لعرض منتجات حقيقية من قاعدة البيانات فعليًا، وليس مجرد تكبير العنوان.
const HOMEPAGE_PRODUCTS_LIMIT = 8;

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

export default async function Home() {
  const { products } = await getPublishedProductsPage({ page: 1, pageSize: HOMEPAGE_PRODUCTS_LIMIT });

  return (
    <>
      <JsonLd data={websiteJsonLd()} />
      <Hero />

      {/* "المنتجات" بين خطّين ذهبيين متدرّجين، بلون متلألئ (طلب صريح) بدل رابط نصي عادي.
          حجم أكبر قليلاً ومسافة أوسع حولها (طلب صريح لاحق) — بلا أي تعديل آخر هنا. */}
      <section className="container-page py-8 text-center">
        <div className="max-w-xs mx-auto h-px bg-gradient-to-r from-transparent via-gold to-transparent" />
        <Link
          href="/products"
          className="inline-block font-display text-3xl md:text-4xl font-extrabold gold-gradient-text my-5 hover:opacity-80 transition-opacity"
        >
          المنتجات
        </Link>
        <div className="max-w-xs mx-auto h-px bg-gradient-to-r from-transparent via-gold to-transparent" />
      </section>

      {/* شبكة منتجات حقيقية من قاعدة البيانات (طلب صريح: "بلاصة" تحت عنوان المنتجات لعرض
          منتجات حقيقية) — بلا فلتر تصنيفات هنا (معاينة فقط)، نفس مكوّن ProductGrid المُستعمل
          فصفحات التصنيف والبحث، فلا تكرار منطق أو بيانات مُلفَّقة. */}
      {products.length > 0 && (
        <section className="container-page pb-14 md:pb-20">
          <ProductGrid products={products} showFilter={false} />
        </section>
      )}

      {/* صورة "ما يميزنا" ممتدة حافة إلى حافة (طلب صريح) — بلا إطار ذهبي وبلا أي مسافة على
          الجانبين، فلا حاويةcontainer-page هنا عمدًا، والصورة نفسها تحمل عنوان "ما يميزنا"
          مرسومًا بداخلها فلا حاجة لعنوان قسم مكرِّر. */}
      <section>
        <BrandImage
          src="/images/highlights/ma-yumayyizna.png"
          alt="ما يميزنا: ضمان حقيقي، الشحن إلى 69 ولاية، الدفع عند الاستلام، خدمة ما بعد البيع"
          width={1536}
          height={1024}
          className="w-full h-auto block"
          sizes="100vw"
        />
      </section>
    </>
  );
}
