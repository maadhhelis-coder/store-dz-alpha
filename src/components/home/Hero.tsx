import BrandImage from "@/components/brand/BrandImage";
import { SITE_TAGLINE } from "@/data/site";

// النص الظاهر سابقًا ("Store DZ — الجزائر" + العنوان الرئيسي) أُزيل بطلب صريح — سيُستبدل
// بشريط شعار + نص (بانتظار ملف الشعار الفعلي من صاحب المتجر، لم يصل بعد كملف حقيقي).
// h1 يبقى ضروريًا لصحة الصفحة (كل صفحة تحتاج h1 واحدًا بالضبط فعليًا فهذا المشروع) —
// أُبقي عليه sr-only مؤقتًا (غير ظاهر بصريًا) حتى يجهز العنصر البديل الظاهر.
// صورة الغلاف ممتدة حافة إلى حافة بلا إطار ذهبي وبلا أي مسافة جانبية (طلب صريح) بدل
// الشبكة ثنائية الأعمدة السابقة.
export default function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-gold/15">
      <h1 className="sr-only">Store DZ — {SITE_TAGLINE}</h1>
      {/* 3/2 يطابق أبعاد الصورة الأصلية (1536×1024) بالضبط — أي نسبة أخرى تفرض قصًا (crop)
          إضافيًا لم يُطلَب، وقد تُخفي أو تُبرِز أجزاء من التصميم الأصلي بشكل غير مقصود. */}
      <div className="relative aspect-[3/2]">
        <BrandImage
          src="/images/banners/delivery-coverage-hero.png"
          alt="Store DZ — توصيل إلى 69 ولاية"
          fill
          priority
          className="object-cover"
          sizes="100vw"
        />
      </div>
    </section>
  );
}
