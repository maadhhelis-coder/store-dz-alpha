import BrandImage from "@/components/brand/BrandImage";

const MARQUEE_TEXT = "منتجات تختارها بثقة وتوصلك أينما كنت";

// عدد كافٍ من الوحدات (شعار+نص+فاصل) داخل "طقم" واحد ليغطّي أعرض شاشة متوقّعة (~3000px+
// بلا أي فراغ أثناء الحركة — طلب صريح: "لا يظهر أي فراغ أبيض أو فارغ"). الطقم يتكرر مرتين
// (راجع الحلقة أدناه) لحلقة سلسة كلاسيكية بلا أي قفزة أو Flash عند الدوران.
const UNITS_PER_SET = 8;

function MarqueeUnit({ index }: { index: number }) {
  return (
    // مقاسات ثابتة بلا أي breakpoint (طلب صريح: "نفس الإحساس بالسرعة على الهاتف والكمبيوتر
    // ... لا تجعل الشريط يبطئ عندما يكون عرض الشاشة صغيرًا"). كانت الوحدة سابقًا تصغر على
    // الهاتف (sm:/md:) بينما مدة الحركة ثابتة — يعني عرض "الطقم" الفعلي بالبكسل يختلف بين
    // الشاشات فتختلف السرعة الفعلية (px/s) رغم نفس المدة بالثواني. عرض ثابت للوحدة على كل
    // الشاشات + مدة ثابتة (globals.css) = سرعة px/s ثابتة فعليًا بلا أي جافاسكريبت لقياسها.
    <span className="flex items-center gap-2.5 shrink-0 mx-3.5">
      <BrandImage
        src="/images/brand/logo-badge.png"
        alt=""
        width={80}
        height={80}
        priority={index === 0}
        className="h-7 w-auto shrink-0 rounded-full drop-shadow-[0_0_4px_rgba(212,175,55,0.5)]"
      />
      <span className="text-base font-semibold text-white whitespace-nowrap">
        {MARQUEE_TEXT}
      </span>
      <span className="text-gold text-lg" aria-hidden="true">
        ✦
      </span>
    </span>
  );
}

function MarqueeSet() {
  return (
    <span className="flex items-center">
      {Array.from({ length: UNITS_PER_SET }).map((_, i) => (
        <MarqueeUnit key={i} index={i} />
      ))}
    </span>
  );
}

// شريط إعلاني متحرك (Announcement / Marquee Bar) مستقل أعلى المتجر — طلب صريح مفصَّل كامل
// (14 بندًا): حلقة لا نهائية سلسة، شعار Store DZ الحقيقي (بلا تشويه أو قص)، نص أبيض واضح،
// لمسات ذهبية كـaccent فقط، أداء GPU-only بلا أي جافاسكريبت (خلاف النسخة السابقة التي
// كانت تقيس الأداء بجافاسكريبت — طلب صريح هذه المرة تجنّب أي "JavaScript animation loops
// غير ضرورية"). Server Component خالص، بلا "use client" وبلا أي حالة — أخفّ ما يمكن.
export default function MarqueeBanner() {
  return (
    <div
      className="w-full overflow-hidden bg-gradient-to-r from-black via-ink-light to-black py-2.5"
      role="region"
      aria-label="إعلان المتجر"
    >
      {/* رسالة واحدة مقروءة لقارئات الشاشة فقط — الشريط المتحرك نفسه aria-hidden لأن محتواه
          مكرّر 16 مرة لأجل الحلقة السلسة (لا يصلح دلاليًا كمحتوى مُكرَّر). */}
      <span className="sr-only">{MARQUEE_TEXT} — Store DZ</span>
      <div className="flex items-center w-max marquee-banner-track" aria-hidden="true">
        <MarqueeSet />
        <MarqueeSet />
      </div>
    </div>
  );
}
