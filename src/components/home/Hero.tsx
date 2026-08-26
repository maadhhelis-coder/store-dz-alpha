import BrandImage from "@/components/brand/BrandImage";
import { SITE_TAGLINE } from "@/data/site";

// الشريط المتحرك السابق حُذف نهائيًا من هنا (طلب صريح) — استُبدل بشريط ثابت مستقل كليًا
// (BrandBar فـsrc/components/layout/) موضوع تحت الهيدر مباشرة، بلا أي حركة. لا علاقة له
// بـHero بعد الآن.
export default function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-gold/15">
      <h1 className="sr-only">Store DZ — {SITE_TAGLINE}</h1>

      {/* عرض أقصى بدل قص بالارتفاع (طلب صريح: نسخة القص السابقة كانت تُخفي عنوان "توصيل"
          وصف الأيقونات السفلي بالكامل من منتصف الصورة — غير احترافي، دليل حقيقي بالمعاينة).
          هنا الصورة كاملة بلا أي قص، فقط بحجم أصغر على الشاشات الواسعة (max-w)، ممركزة على
          خلفية سوداء تطابق خلفية الصفحة فلا يبدو أي فراغ جانبي كخلل. على الهاتف تبقى ممتدة
          كامل العرض طبيعيًا (w-full بلا حد أقصى قبل sm). */}
      <div className="w-full flex justify-center bg-black">
        <BrandImage
          src="/images/banners/delivery-coverage-hero.png"
          alt="Store DZ — توصيل إلى 69 ولاية"
          width={1536}
          height={1024}
          priority
          className="w-full sm:max-w-2xl md:max-w-3xl h-auto"
          sizes="(max-width: 640px) 100vw, 768px"
        />
      </div>
    </section>
  );
}
