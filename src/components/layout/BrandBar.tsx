import BrandImage from "@/components/brand/BrandImage";

// شريط ثابت أعلى المتجر تحت الهيدر — طلب صريح: إزالة الشريط المتحرك نهائيًا (بعد محاولات
// عدة لضبط سرعته لم تُجدِ، والسبب الأرجح أداء حقيقي فأجهزة أضعف لا يمكن لأي ضبط CSS
// تجاوزه). شعار + نص فقط، بلا أي حركة إطلاقًا. حجم متدرّج حسب الشاشة (أكبر قليلاً بالحاسوب،
// مناسب لحجم شاشة الهاتف) — لا داعي بعد الآن لعرض ثابت بلا breakpoints (كان ذلك خاصًّا
// بضمان سرعة px/s ثابتة للحركة، ولم تعد هناك حركة).
// طلب صريح لاحق: (1) إزالة توهج drop-shadow الذهبي حول اللوغو والتدرّج اللوني للخلفية (كانا
// يُقرآن بصريًا كـ"أسود ممزوج بأصفر/أبيض" بدل أسود خالص) لصالح خلفية سوداء خالصة bg-black.
// (2) "ارجع اللوغو بجانب الكتابة" — اللوغو والنص مجموعة متلاصقة (بلا flex-1/text-center).
// (3) طلب صريح لاحق آخر: "الكتابة مع الشعار فالنصف" — المجموعة كاملة الآن في منتصف الشريط
// (justify-center) بدل الالتصاق بالحافة اليمنى فقط. (4) "دائرته سوداء لا سوداء وفيها اضاءة
// صفراء" — قراءة بكسلات logo-badge.png فعليًا أظهرت حوافه نظيفة (أسود خالص حتى ~97% من نصف
// القطر، لا اصفر) خلافًا لـlogo-on-black.png المُستعمَل بالهيدر، لكن حلقة بيضاء رفيعة حقيقية
// (وليست تنعيم antialiasing فقط) مرسومة عند آخر ~1% من نصف القطر تحديدًا — تأكّد ذلك بصريًا
// (لقطة مكبَّرة). هذه حلقة منفصلة عن الشعار/النص (لا تلامسهما إطلاقًا)، فعكس حالة الهيدر:
// scale>1 هنا صحيح وآمن 100% — يدفع تلك الحلقة الرفيعة فقط خارج حدود القصّ الدائري بلا أي
// تأثير على الشعار أو "STORE DZ" (بعيدان تمامًا عن تلك الحافة). scale(1.08) عبر style مضمّن
// (فئة Tailwind scale-[…] أثبتت أنها لا تُطبَّق فعليًا فهذا المشروع — انظر تعليق Logo.tsx).
export default function BrandBar() {
  return (
    <div className="w-full bg-black py-4 md:py-5 lg:py-6 px-4 sm:px-6 lg:px-10 xl:px-14">
      <div className="flex items-center justify-center gap-3 sm:gap-4 md:gap-6 lg:gap-8">
        <span className="relative overflow-hidden rounded-full shrink-0 inline-block w-10 h-10 sm:w-12 sm:h-12 md:w-16 md:h-16 lg:w-20 lg:h-20 bg-black">
          <BrandImage
            src="/images/brand/logo-badge.png"
            alt="شعار Store DZ"
            width={120}
            height={120}
            priority
            className="w-full h-full object-cover"
            style={{ transform: "scale(1.08)" }}
          />
        </span>
        <span className="font-display text-base sm:text-lg md:text-2xl lg:text-3xl font-bold gold-gradient-text leading-snug">
          منتجات تختارها بثقة وتوصلك أينما كنت
        </span>
      </div>
    </div>
  );
}
