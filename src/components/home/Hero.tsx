import BrandImage from "@/components/brand/BrandImage";
import { SITE_TAGLINE } from "@/data/site";

const MARQUEE_TEXT = "منتجات تختارها بثقة وتوصلك أينما كنت";

// وحدتان فقط (طلب صريح لاحق: "اريد جعل الجملة مكررة مرتين فقط") داخل كل طقم — مع قناع
// تلاشي الحواف (marquee-fade-mask فـglobals.css) الذي يجعل دخول/خروج كل نسخة يبدو "دخولاً
// فنفق" بدل قصّ مفاجئ. أحجام متدرّجة حسب الشاشة (طلب صريح: مقاس يناسب الهاتف والحاسوب
// معًا). كلتا الوحدتين priority الآن (بخلاف نسخة سابقة بأربع وحدات حيث كانت وحدة واحدة فقط
// عاجلة) — بوحدتين فقط لا داعٍ لتأجيل تحميل أي منهما، وهذا يمنع أي تأخر إضافي فظهور الشريط
// أول مرة (طلب صريح لاحق: "طول باش تظهر" عند الدخول للمتجر أول مرة).
const MARQUEE_UNITS = 2;

// شريط متحرك بلا توقف (طلب صريح، أُكِّد عدة مرات): الشعار الكامل (الشارة الدائرية بالضبط
// كما أُرسلت — لا نص "Store DZ" منفصل بجانبه لأنه مكتوب داخلها أصلاً) يتحرك مع الجملة معًا
// كوحدة واحدة متكررة عبر .animate-marquee (راجع globals.css)، من اليسار إلى اليمين (طلب
// صريح: عكس الاتجاه الأصلي). h1 حقيقي يبقى ضروريًا لصحة الصفحة SEO؛ بما أن كل الوحدات
// الظاهرة بصريًا هنا نص/شعار متكرر لأجل الحلقة السلسة (لا يصلح دلاليًا كمحتوى)، يبقى
// الشريط كله aria-hidden ويُعوَّضه h1 منفصل غير ظاهر بصريًا (sr-only) يحمل اسم الموقع
// ووصفه الحقيقي. ارتفاع الشريط 3سم (طلب صريح).
function MarqueeSet() {
  return (
    <div className="flex items-center">
      {Array.from({ length: MARQUEE_UNITS }).map((_, i) => (
        <div key={i} className="flex items-center gap-2 sm:gap-3 mx-4 sm:mx-6 md:mx-8 shrink-0">
          <BrandImage
            src="/images/brand/logo-badge.png"
            alt="Store DZ"
            width={200}
            height={200}
            className="h-9 sm:h-11 md:h-14 w-auto shrink-0 rounded-full"
            priority
          />
          <span className="font-display text-sm sm:text-base md:text-lg lg:text-2xl font-bold marquee-text whitespace-nowrap">
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

      {/* marquee-fade-mask (راجع globals.css): تلاشي تدريجي عند حافتي الشريط بدل قصّ حاد —
          طلب صريح: "تدخل الجملة نفقًا ثم تعاود تخرج" مثل أشرطة القنوات التلفزيونية. تدرّج
          ذهبي خفيف بدل الأسود المسطّح (طلب صريح: "زخرفة تجلب النظر وتكون أكثر احترافية")
          — بلا أي خط/حدّ فاصل عن الصورة أدناه (طلب صريح سابق برفض ذلك). */}
      <div className="h-[3cm] flex items-center overflow-hidden bg-gradient-to-r from-black via-gold/10 to-black marquee-fade-mask">
        <div className="flex items-center animate-marquee w-max" aria-hidden="true">
          <MarqueeSet />
          <MarqueeSet />
        </div>
      </div>

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
