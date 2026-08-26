import BrandImage from "@/components/brand/BrandImage";
import { SITE_TAGLINE } from "@/data/site";

// الشريط المتحرك السابق حُذف نهائيًا من هنا (طلب صريح) — استُبدل بشريط ثابت مستقل كليًا
// (BrandBar فـsrc/components/layout/) موضوع تحت الهيدر مباشرة، بلا أي حركة. لا علاقة له
// بـHero بعد الآن.
export default function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-gold/15">
      <h1 className="sr-only">Store DZ — {SITE_TAGLINE}</h1>

      {/* طلب صريح لاحق: "بدون جوانب سوداء" — نسخة max-w المُمركَزة كانت تمنع القصّ فعلاً،
          لكنها تركت فراغًا أسود جانبيًا على الشاشات الواسعة. ممتدة حافة إلى حافة هنا (بلا
          max-w)، مع object-position: top للحفاظ على العنوان والشعار والخريطة/الشاحنة كاملين
          — الجزء الوحيد الذي يُقصّ عند الحاجة هو صف الأيقونات السفلي الرفيع، وهو نفسه مكرَّر
          بلا فقدان فعلي بقسم "ما يميزنا" أدناه. الارتفاع بـclamp() بدل قفزات breakpoints
          (طلب صريح لاحق: "مقاس احترافي ومناسب للحاسوب") — يتدرّج بسلاسة مع عرض الشاشة
          فعليًا بدل نسب متقطعة، بحدّين أدنى/أقصى يمنعان أن يصبح صغيرًا جدًا أو ضخمًا جدًا.
          آمن هنا رغم دمجه ارتفاعًا مُشتقًا من العرض مع w-full صريح — خلافًا لخلل
          aspect-ratio+max-height السابق (كان يحدث فقط حين لا يوجد عرض صريح على الصندوق). */}
      <div className="relative w-full h-[clamp(300px,34vw,560px)]">
        <BrandImage
          src="/images/banners/delivery-coverage-hero.png"
          alt="Store DZ — توصيل إلى 69 ولاية"
          fill
          priority
          className="object-cover object-top"
          sizes="100vw"
        />
      </div>
    </section>
  );
}
