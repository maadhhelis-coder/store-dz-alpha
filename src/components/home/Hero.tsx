import BrandImage from "@/components/brand/BrandImage";
import { SITE_TAGLINE } from "@/data/site";

// الشريط المتحرك السابق حُذف نهائيًا من هنا (طلب صريح) — استُبدل بشريط ثابت مستقل كليًا
// (BrandBar فـsrc/components/layout/) موضوع تحت الهيدر مباشرة، بلا أي حركة. لا علاقة له
// بـHero بعد الآن.
export default function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-gold/15">
      <h1 className="sr-only">Store DZ — {SITE_TAGLINE}</h1>

      {/* طلب صريح لاحق: "الصورة الاولى محذوف منها كلمات" — القصّ (object-cover) عند أي نسبة
          حاوية أعرض من 3:2 الأصلية للصورة يقصّ حتمًا صف الأيقونات السفلي (توصيل سريع/ثقة
          وأمان/تغليف محكم/تغطية شاملة)، وهو محتوى حقيقي غير مكرَّر فأي مكان آخر بالصفحة الآن.
          الحل الوحيد المضمون بلا أي قصّ مهما كان عرض الشاشة: بلا crop إطلاقًا — width/height
          أصليان (1536×1024) + w-full h-auto (تناسب فعلي، لا fill/object-cover). طلب صريح
          لاحق: "حل للمساحات السوداء التي على جنبي الصور" — أُزيل حدّ max-w الذي كان يترك
          فراغًا جانبيًا واضحًا؛ حافة-إلى-حافة فعليًا الآن (bg-black + خلفية الصفحة السوداء
          نفسها) دون أي فراغ. طلب صريح لاحق: "نقص فالزووم كي لا يعمو عين الزبون" ثم طلب صريح
          آخر لاحقًا: "نقص فالزووم فالصورتين بالحاسوب 10% مرة اخرى" — تصغير أكبر بالحاسوب
          تحديدًا من الهاتف الآن (0.82 مقابل 0.92)، لذا فئة CSS متجاوبة .banner-zoom (انظر
          globals.css) بدل قيمة scale ثابتة واحدة؛ بلا تغيير موضع/عرض الحاوية (تبقى الحافتان
          الخارجيتان أسود خالص، لا فراغًا بصريًا "محسوسًا" كصندوق). */}
      <div className="w-full flex justify-center bg-black">
        <BrandImage
          src="/images/banners/delivery-coverage-hero.png"
          alt="Store DZ — توصيل إلى 69 ولاية"
          width={1536}
          height={1024}
          priority
          className="w-full h-auto banner-zoom"
          sizes="100vw"
        />
      </div>
    </section>
  );
}
