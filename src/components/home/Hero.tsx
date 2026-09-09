import BrandImage from "@/components/brand/BrandImage";
import { SITE_TAGLINE } from "@/data/site";

// الشريط المتحرك السابق حُذف نهائيًا من هنا (طلب صريح) — استُبدل بشريط ثابت مستقل كليًا
// (BrandBar فـsrc/components/layout/) موضوع تحت الهيدر مباشرة، بلا أي حركة. لا علاقة له
// بـHero بعد الآن.
export default function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-gold/15">
      <h1 className="sr-only">Store DZ — {SITE_TAGLINE}</h1>

      {/* بانر جديد أرسله صاحب المتجر بمقاس 2880×960 (نسبة 3:1) — استبدل نسخة 3:2 التي
          كانت تُرسم بارتفاع 951px على شاشة 1440×900، أي أطول من الشاشة نفسها. النسبة
          الجديدة تعطي ~480px على نفس الشاشة.
          بلا قصّ إطلاقًا: width/height أصليان + w-full h-auto (لا fill/object-cover) —
          صف الأيقونات السفلي داخل الصورة محتوى حقيقي، وأي object-cover يقصّه.
          بلا max-w: حافة-إلى-حافة فعليًا، والزخرفة تلامس حافتي الصفحة كما طُلب.
          فئة .banner-zoom أُزيلت مع قواعدها من globals.css — التصغير كان يعوّض نسبة 3:2
          الطويلة، والنسبة الجديدة تغني عنه. */}
      <div className="w-full flex justify-center bg-black">
        <BrandImage
          src="/images/banners/delivery-coverage-hero.png"
          alt="Store DZ — توصيل إلى 69 ولاية"
          width={2880}
          height={960}
          priority
          className="w-full h-auto"
          sizes="100vw"
        />
      </div>
    </section>
  );
}
