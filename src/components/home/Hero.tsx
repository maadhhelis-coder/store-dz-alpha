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
          وأمان/تغليف محكم/تغطية شاملة)، وهو محتوى حقيقي غير مكرَّر فأي مكان آخر بالصفحة الآن
          (قسم "ما يميزنا" الجديد له تسمياته الخاصة المختلفة). الحل الوحيد المضمون بلا أي قصّ
          مهما كان عرض الشاشة: بلا crop إطلاقًا — width/height أصليان (1536×1024) + w-full
          h-auto (تناسب فعلي، لا fill/object-cover). لتفادي أن تصبح "كبيرة بزاف" على الشاشات
          الواسعة (طلب صريح) — max-w-5xl يحدّ العرض الأقصى لحجم احترافي معقول بدل الامتداد
          لعرض الشاشة كاملًا؛ bg-black + الخلفية السوداء لبقية الصفحة تجعله يبدو حافة-إلى-حافة
          فعليًا بلا أي إطار مرئي، رغم عدم بلوغه literal 100vw. */}
      <div className="w-full flex justify-center bg-black">
        <BrandImage
          src="/images/banners/delivery-coverage-hero.png"
          alt="Store DZ — توصيل إلى 69 ولاية"
          width={1536}
          height={1024}
          priority
          className="w-full max-w-5xl h-auto"
          sizes="(max-width: 1024px) 100vw, 1024px"
        />
      </div>
    </section>
  );
}
