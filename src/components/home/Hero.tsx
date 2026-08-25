import BrandImage from "@/components/brand/BrandImage";
import { SITE_TAGLINE } from "@/data/site";

const MARQUEE_TEXT = "منتجات تختارها بثقة وتوصلك أينما كنت";

// جملة واحدة فقط تتكرر (طلب صريح لاحق: نسخة سابقة كررت الوحدة 6 مرات لتفادي فجوة فارغة على
// الشاشات العريضة، فبدت 3 نسخ ثابتة من نفس الجملة معًا فآن واحد — وهو بالضبط ما رفضه صاحب
// المتجر: "الشريط لا يتكرر أبدًا" يعني عدة نسخ ساكنة بدل نسخة واحدة تتحرك وتُعاد. الحل هنا
// نسخة واحدة فقط + مدة حركة أقصر (راجع .animate-marquee فـglobals.css) بدل تكثيف النسخ.
const MARQUEE_UNITS = 1;

// شريط متحرك بلا توقف (طلب صريح، أُكِّد مرتين): الشعار الكامل (الشارة الدائرية بالضبط كما
// أُرسلت — لا نص "Store DZ" منفصل بجانبه لأنه مكتوب داخلها أصلاً) يتحرك الآن مع الجملة معًا
// كوحدة واحدة متكررة عبر .animate-marquee (راجع globals.css)، وليس ثابتًا بجانب نص متحرك.
// h1 حقيقي يبقى ضروريًا لصحة الصفحة SEO؛ بما أن كل الوحدات الظاهرة بصريًا هنا نص/شعار
// متكرر لأجل الحلقة السلسة (لا يصلح دلاليًا كمحتوى)، يبقى الشريط كله aria-hidden ويُعوَّضه
// h1 منفصل غير ظاهر بصريًا (sr-only) يحمل اسم الموقع ووصفه الحقيقي.
// صورة الغلاف أدناها ممتدة حافة إلى حافة بلا إطار ذهبي وبلا أي مسافة جانبية أو خط فاصل
// فوقها (طلب صريح لاحق: إزالة الخط الذهبي بين الشريط والصورة ورفعها للأعلى)، بنسبة أبعاد
// 3/2 مطابقة تمامًا لأبعاد الصورة الأصلية (1536×1024). ارتفاع الشريط 3سم (خُفِّض من 4سم
// بطلب صريح لاحق).
function MarqueeSet() {
  return (
    <div className="flex items-center">
      {Array.from({ length: MARQUEE_UNITS }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 mx-8 shrink-0">
          <BrandImage
            src="/images/brand/logo-badge.png"
            alt="Store DZ"
            width={200}
            height={200}
            className="h-14 w-auto shrink-0 rounded-full"
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

      <div className="h-[3cm] flex items-center overflow-hidden bg-black">
        <div className="flex items-center animate-marquee w-max" aria-hidden="true">
          <MarqueeSet />
          <MarqueeSet />
        </div>
      </div>

      {/* ارتفاع صريح متدرّج حسب حجم الشاشة (طلب صريح: مقاس يناسب الهاتف والحاسوب معًا) بدل
          aspect-ratio+max-h — تلك التركيبة كانت تجعل المتصفح يحسب العرض من الارتفاع
          المحدود (aspect-ratio على صندوق width:auto) فينكمش الصندوق ويلتصق بحافة البداية
          فـRTL (اليمين)، تاركًا فراغًا أسود على اليسار — دليل حقيقي شوهد فعليًا على الحاسوب.
          w-full صريح هنا يضمن الامتداد الكامل أفقيًا فكل حجم شاشة بلا أي فراغ جانبي. */}
      <div className="relative w-full h-[220px] sm:h-[300px] md:h-[420px] lg:h-[520px]">
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
