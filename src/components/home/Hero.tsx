import BrandImage from "@/components/brand/BrandImage";
import { SITE_TAGLINE } from "@/data/site";

const MARQUEE_TEXT = "منتجات تختارها بثقة وتوصلك أينما كنت";

// شريط متحرك بلا توقف (طلب صريح — نسخة سابقة كانت فاصلاً ثابتًا بلا حركة، وهذا خطأ فُهم
// وأُصلح بعد توضيح صريح): الشعار الكامل (الشارة الدائرية بالضبط كما أُرسلت — لا نص "Store
// DZ" منفصل بجانبه لأنه مكتوب داخلها أصلاً) ثابت لا يتحرك، والنص بجانبه يتحرك باستمرار عبر
// .animate-marquee (راجع globals.css). h1 حقيقي يبقى ضروريًا لصحة الصفحة SEO؛ بما أن
// المحتوى الظاهر بصريًا هنا نص متكرر لأجل الحلقة السلسة (لا يصلح دلاليًا كـh1)، يبقى h1
// منفصلاً غير ظاهر بصريًا (sr-only) يحمل اسم الموقع ووصفه الحقيقي.
// صورة الغلاف أدناها ممتدة حافة إلى حافة بلا إطار ذهبي وبلا أي مسافة جانبية (طلب صريح)،
// بنسبة أبعاد 3/2 مطابقة تمامًا لأبعاد الصورة الأصلية (1536×1024).
export default function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-gold/15">
      <h1 className="sr-only">Store DZ — {SITE_TAGLINE}</h1>

      <div className="h-[4cm] flex items-center gap-4 px-4 md:px-8 bg-black border-b border-gold/15">
        <BrandImage
          src="/images/brand/logo-badge.png"
          alt="Store DZ"
          width={200}
          height={200}
          className="h-[70%] w-auto shrink-0 rounded-full"
          priority
        />
        <div className="flex-1 overflow-hidden">
          <div className="flex whitespace-nowrap animate-marquee w-max">
            <span className="mx-8 font-display text-lg md:text-2xl font-bold gold-gradient-text">
              {MARQUEE_TEXT}
            </span>
            <span className="mx-8 font-display text-lg md:text-2xl font-bold gold-gradient-text" aria-hidden="true">
              {MARQUEE_TEXT}
            </span>
          </div>
        </div>
      </div>

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
