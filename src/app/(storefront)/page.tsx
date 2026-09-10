import type { Metadata } from "next";
import { Suspense } from "react";
import Hero from "@/components/home/Hero";
import JsonLd from "@/components/shared/JsonLd";
import ProductCard from "@/components/commerce/ProductCard";
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
    <div className="mt-8 flex flex-wrap justify-center gap-6">
      {products.map((product) => (
        <div key={product.slug} className="w-full max-w-xs">
          <ProductCard product={product} />
        </div>
      ))}
    </div>
  );
}

export default function Home() {
  return (
    <>
      <JsonLd data={websiteJsonLd()} />
      <Hero />

      {/* الخطّان الذهبيان صارا إطارًا مستطيليًا طويلًا (طلب صريح): «المنتجات» في
          أعلاه ووسطه وكبيرة، تحتها خط زخرفة أصفر/أسود، ثم المنتج نفسه في الوسط.
          خطوط الإطار صفراء باردة بظل هادئ لا ساطع. العنوان لم يعد رابطًا — لا
          يأخذ الزائر إلى أي مكان. pt أقل (طلب: "ارفعه قليلًا"). */}
      <section className="container-page pt-3 pb-8 md:pt-4">
        <div className="gold-border-cool gold-glow-cool rounded-2xl px-4 py-10 md:px-8 md:py-14">
          <h2 className="text-center font-display text-4xl md:text-5xl font-extrabold gold-gradient-text">
            المنتجات
          </h2>
          <div className="divider-gold-black mx-auto mt-5 max-w-sm" />

          <Suspense fallback={null}>
            <ProductsPreview />
          </Suspense>
        </div>
      </section>

      {/* طلب صريح لاحق: استبدال قسم "ما يميزنا" (كان HTML/CSS ببطاقات TRUST_BADGES) بصورة
          جديدة زوّدنيها المستخدم مباشرة — نسبة أبعادها الحقيقية عريضة جدًا (~2:1، 1774×887)
          خلافًا للصورة القديمة (3:2) التي فرضت معضلة القصّ/الفراغ الجانبي. w-full h-auto
          (بلا crop/fill) يحافظ على كامل الزخرفة الذهبية والعنوان المرسومين داخل الصورة نفسها
          دون أي قصّ. "حل للمساحات السوداء التي على جنبي الصور" — بلا حدّ max-w، حافة-إلى-حافة
          فعليًا. طلب صريح لاحق: أُزيل التصغير (scale) من النسختين — كان يترك حافتين
          سوداوين على الجانبين فلا تلتصق الزخرفة بحافتي الصفحة. مقاس العناصر داخل
          الصورة لم يتغيّر (هي صورة واحدة جاهزة، لا عناصر منفصلة).
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
          sizes="100vw"
        />
        <BrandImage
          src="/images/highlights/ma-yumayyizna.png"
          alt="ما يميزنا: خدمة ما بعد البيع، الدفع عند الاستلام، ضمان حقيقي، الشحن الى 69 ولاية"
          width={1774}
          height={887}
          className="hidden md:block w-full h-auto"
          sizes="100vw"
        />
      </section>
    </>
  );
}
