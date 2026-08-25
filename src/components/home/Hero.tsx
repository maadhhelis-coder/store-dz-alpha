import BrandImage from "@/components/brand/BrandImage";
import { SITE_TAGLINE } from "@/data/site";

const MARQUEE_TEXT = "منتجات تختارها بثقة وتوصلك أينما كنت";

// عدد التكرارات داخل "طقم" واحد قبل تكراره مرة ثانية للحلقة السلسة — طلب صريح: الشعار
// يتحرك مع الجملة كوحدة واحدة (وليس ثابتًا بجانب نص متحرك كما فالنسخة السابقة)، والجملة
// يجب أن تظل ظاهرة ومقروءة كاملة بلا فجوة فارغة طويلة قبل ظهورها من جديد. طقم بتكرار واحد
// فقط كان يترك فجوة سوداء فارغة كبيرة على الشاشات العريضة كلما خرج الطقمان معًا من الإطار
// قبل عودة أحدهما — تكرار الوحدة (شعار+جملة) عدة مرات داخل الطقم الواحد يضمن وجود نسخة
// ظاهرة دومًا فالإطار مهما كان عرض الشاشة، فلا يبدو الشريط "يتوقف" أو يتأخر فظهوره مجددًا.
const MARQUEE_UNITS = 6;

// شريط متحرك بلا توقف (طلب صريح، أُكِّد مرتين): الشعار الكامل (الشارة الدائرية بالضبط كما
// أُرسلت — لا نص "Store DZ" منفصل بجانبه لأنه مكتوب داخلها أصلاً) يتحرك الآن مع الجملة معًا
// كوحدة واحدة متكررة عبر .animate-marquee (راجع globals.css)، وليس ثابتًا بجانب نص متحرك.
// h1 حقيقي يبقى ضروريًا لصحة الصفحة SEO؛ بما أن كل الوحدات الظاهرة بصريًا هنا نص/شعار
// متكرر لأجل الحلقة السلسة (لا يصلح دلاليًا كمحتوى)، يبقى الشريط كله aria-hidden ويُعوَّضه
// h1 منفصل غير ظاهر بصريًا (sr-only) يحمل اسم الموقع ووصفه الحقيقي.
// صورة الغلاف أدناها ممتدة حافة إلى حافة بلا إطار ذهبي وبلا أي مسافة جانبية (طلب صريح)،
// بنسبة أبعاد 3/2 مطابقة تمامًا لأبعاد الصورة الأصلية (1536×1024).
function MarqueeSet() {
  return (
    <div className="flex items-center">
      {Array.from({ length: MARQUEE_UNITS }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 mx-10 shrink-0">
          <BrandImage
            src="/images/brand/logo-badge.png"
            alt="Store DZ"
            width={200}
            height={200}
            className="h-[4.5rem] w-auto shrink-0 rounded-full"
            priority={i === 0}
          />
          <span className="font-display text-lg md:text-2xl font-bold gold-gradient-text whitespace-nowrap">
            {MARQUEE_TEXT}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-gold/15">
      <h1 className="sr-only">Store DZ — {SITE_TAGLINE}</h1>

      <div className="h-[4cm] flex items-center overflow-hidden bg-black border-b border-gold/15">
        <div className="flex items-center animate-marquee w-max" aria-hidden="true">
          <MarqueeSet />
          <MarqueeSet />
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
