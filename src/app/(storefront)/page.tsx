import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BadgeCheck, Truck, HandCoins, Headset } from "lucide-react";
import Hero from "@/components/home/Hero";
import JsonLd from "@/components/shared/JsonLd";
import ProductGrid from "@/components/commerce/ProductGrid";
import { buildMetadata, websiteJsonLd } from "@/lib/seo";
import { getPublishedProductsPage } from "@/lib/storefrontData";
import { TRUST_BADGES } from "@/data/site";

// نفس تعيين الأيقونات المُستعمَل فـTrustBadgeStrip.tsx (لا تكرار منطق جديد، فقط استعمال
// محلي هنا لأن قسم "ما يميزنا" له تنسيق بصري أكبر/أكثر زخرفة من الشريط المضغوط هناك).
const WHY_US_ICONS = {
  "badge-check": BadgeCheck,
  truck: Truck,
  "hand-coins": HandCoins,
  headset: Headset,
} as const;

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

// معاينة المنتجات فمكوّن Server منفصل مُغلَّف بـSuspense (طلب صريح: الصفحة الرئيسية —
// وعلى رأسها الشريط المتحرك — كانت "تطول باش تظهر" عند أول زيارة). السبب الحقيقي: Home()
// كانت async وتنتظر استعلام قاعدة البيانات هذا بالكامل قبل إرسال أي HTML، فيتأخر ظهور
// الشريط والصورة خلف زمن استجابة قاعدة البيانات (خصوصًا فبداية اتصال باردة). فصلها هنا
// يسمح للمتصفح باستلام Hero وبقية الصفحة فورًا فيما يُستكمل جلب المنتجات فالخلفية.
async function ProductsPreview() {
  const { products } = await getPublishedProductsPage({ page: 1, pageSize: HOMEPAGE_PRODUCTS_LIMIT });
  if (products.length === 0) return null;
  return (
    <section className="container-page pb-14 md:pb-20">
      <ProductGrid products={products} showFilter={false} />
    </section>
  );
}

export default function Home() {
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
          فصفحات التصنيف والبحث، فلا تكرار منطق أو بيانات مُلفَّقة. Suspense فارغ fallback
          (بلا مؤشر تحميل) لأن القسم أصلاً اختياري ومُخفى حين لا توجد منتجات. */}
      <Suspense fallback={null}>
        <ProductsPreview />
      </Suspense>

      {/* طلب صريح لاحق: استُبدلت صورة "ما يميزنا" الثابتة (PNG) بقسم HTML/CSS حقيقي —
          الصورة كانت تفرض معضلة لا حل نهائي لها بين "بلا قصّ" و"بلا فراغ جانبي أسود" (أي
          عرض أوسع من عرض احتواء الصورة الطبيعي يعني إما قصًّا أو فراغًا، دليل رياضي: نسبة
          أبعاد الحاوية إذا اختلفت عن 3/2 الأصلية فلا مفرّ من أحدهما). محتوى DOM حقيقي هنا
          لا يواجه هذه المعضلة إطلاقًا مهما كان عرض الشاشة، ويحقق "الأشكال الأربعة أفقيًا
          بجانب بعضها" (طلب صريح) بشكل موثوق تمامًا — نفس بيانات TRUST_BADGES الحقيقية
          المُستعمَلة فصفحة المنتج (لا تكرار بيانات وهمية)، بزخرفة خطوط ذهبية بدل الزخرفة
          المرسومة فالصورة القديمة. */}
      <section className="container-page py-10 md:py-14">
        <div className="max-w-xs mx-auto h-px bg-gradient-to-r from-transparent via-gold to-transparent" />
        <h2 className="text-center font-display text-3xl md:text-4xl font-extrabold gold-gradient-text my-5">
          ما يميزنا
        </h2>
        <div className="max-w-xs mx-auto h-px bg-gradient-to-r from-transparent via-gold to-transparent mb-8 md:mb-10" />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-5 md:gap-8">
          {TRUST_BADGES.map((badge) => {
            const Icon = WHY_US_ICONS[badge.icon as keyof typeof WHY_US_ICONS];
            return (
              <div
                key={badge.id}
                className="flex flex-col items-center text-center gap-3 gold-border rounded-2xl bg-ink py-6 px-4"
              >
                <div className="w-14 h-14 md:w-16 md:h-16 rounded-full gold-border gold-glow flex items-center justify-center">
                  <Icon className="w-7 h-7 md:w-8 md:h-8 text-gold" strokeWidth={1.75} />
                </div>
                <span className="text-sm md:text-base font-bold text-cream">{badge.title}</span>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
