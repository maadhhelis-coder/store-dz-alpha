import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import Hero from "@/components/home/Hero";
import JsonLd from "@/components/shared/JsonLd";
import ProductGrid from "@/components/commerce/ProductGrid";
import BrandImage from "@/components/brand/BrandImage";
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
          حجم أكبر قليلاً ومسافة أوسع حولها (طلب صريح لاحق). ملاحظة: محاولة سابقة قلّصت
          الحشو هنا ظنًّا بأن طلب "هبطها" يخصّ الفراغ *أعلى* قسم "ما يميزنا" — صحّح المستخدم
          صراحة أنه يقصد الفراغ *أسفله* (باتجاه الفوتر)، فأُعيد py-8 الأصلي هنا كاملاً؛
          الإصلاح الفعلي الآن فـFooter.tsx. */}
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

      {/* طلب صريح لاحق: استبدال قسم "ما يميزنا" (كان HTML/CSS ببطاقات TRUST_BADGES) بصورة
          جديدة زوّدنيها المستخدم مباشرة — نسبة أبعادها الحقيقية عريضة جدًا (~2:1، 1774×887)
          خلافًا للصورة القديمة (3:2) التي فرضت معضلة القصّ/الفراغ الجانبي. w-full h-auto
          (بلا crop/fill) يحافظ على كامل الزخرفة الذهبية والعنوان المرسومين داخل الصورة نفسها
          دون أي قصّ. "حل للمساحات السوداء التي على جنبي الصور" — بلا حدّ max-w، حافة-إلى-حافة
          فعليًا. "نقص فالزووم" ثم "نقص فالزووم بالحاسوب 10% مرة اخرى" لاحقًا — نسخة الحاسوب
          (hidden md:block) تستعمل فئة .banner-zoom المتجاوبة (globals.css: 0.82 بالحاسوب)
          بدل قيمة scale ثابتة، بلا تغيير عرض/موضع الحاوية. نسخة الهاتف (md:hidden) أسفله
          تبقى بقيمتها السابقة (scale(0.92) ثابتة) — الطلب الأخير خصّ الحاسوب فقط صراحةً.
          طلب صريح لاحق آخر: "رجع هادي الصورة" بالهاتف تحديدًا — صورة مربّعة الشكل تقريبًا
          (شبكة 2×2، 1240×1131) بدل الصورة العريضة (2:1) المُستعمَلة بالحاسوب، لأن النسبة
          العريضة جدًا تصبح صغيرة جدًا أو تفرض ارتفاعًا غير مناسب بعرض شاشة هاتف ضيّق. صورتان
          منفصلتان بـmd:hidden / hidden md:block بدل صورة واحدة متجاوبة، لأنهما ملفّان
          مختلفان فعليًا (لا مجرّد حجمين لنفس الملف). الملف استُخرج من PDF أرسله المستخدم
          (JPEG مضغوط بـFlateDecode+DCTDecode داخل الـPDF، فُكّ ضغطه واستُخرج مباشرة كملف
          JPEG صالح — بلا حواف بيضاء، خلافًا لصفحة الـPDF نفسها). */}
      <section className="w-full flex justify-center bg-black">
        <BrandImage
          src="/images/highlights/ma-yumayyizna-mobile.jpg"
          alt="ما يميزنا: ضمان حقيقي، الشحن الى 69 ولاية، الدفع عند الاستلام، خدمة ما بعد البيع"
          width={1240}
          height={1131}
          className="w-full h-auto md:hidden"
          style={{ transform: "scale(0.92)" }}
          sizes="100vw"
        />
        <BrandImage
          src="/images/highlights/ma-yumayyizna.png"
          alt="ما يميزنا: خدمة ما بعد البيع، الدفع عند الاستلام، ضمان حقيقي، الشحن الى 69 ولاية"
          width={1774}
          height={887}
          className="hidden md:block w-full h-auto banner-zoom"
          sizes="100vw"
        />
      </section>
    </>
  );
}
