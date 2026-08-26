import BrandImage from "@/components/brand/BrandImage";

// شريط ثابت أعلى المتجر تحت الهيدر — طلب صريح: إزالة الشريط المتحرك نهائيًا (بعد محاولات
// عدة لضبط سرعته لم تُجدِ، والسبب الأرجح أداء حقيقي فأجهزة أضعف لا يمكن لأي ضبط CSS
// تجاوزه). شعار + نص فقط، بلا أي حركة إطلاقًا. حجم متدرّج حسب الشاشة (أكبر قليلاً بالحاسوب،
// مناسب لحجم شاشة الهاتف) — لا داعي بعد الآن لعرض ثابت بلا breakpoints (كان ذلك خاصًّا
// بضمان سرعة px/s ثابتة للحركة، ولم تعد هناك حركة).
// طلب صريح لاحق: (1) اللوغو "لاصق" بالحافة اليمنى بدل مجموعة ممركزة في الوسط — عبر shrink-0
// أول عنصر بترتيب DOM (يمين فـRTL) + padding أفقي خاص بدل container-page، بنفس معاملة
// الهيدر. (2) النص يمتد (flex-1) ليملأ المساحة المتبقية بدل تكتّل صغير ممركز، مع تكبيره.
// (3) إزالة توهج drop-shadow الذهبي حول اللوغو والتدرّج اللوني للخلفية (كانا يُقرآن بصريًا
// كـ"أسود ممزوج بأصفر/أبيض" بدل أسود خالص — طلب صريح) لصالح خلفية سوداء خالصة bg-black.
export default function BrandBar() {
  return (
    <div className="w-full bg-black py-4 md:py-5 lg:py-6 px-4 sm:px-6 lg:px-10 xl:px-14">
      <div className="flex items-center gap-3 sm:gap-4 md:gap-6 lg:gap-8">
        <BrandImage
          src="/images/brand/logo-badge.png"
          alt="شعار Store DZ"
          width={120}
          height={120}
          priority
          className="h-10 sm:h-12 md:h-16 lg:h-20 w-auto shrink-0 rounded-full"
        />
        <span className="flex-1 text-center font-display text-base sm:text-lg md:text-2xl lg:text-3xl font-bold gold-gradient-text leading-snug">
          منتجات تختارها بثقة وتوصلك أينما كنت
        </span>
      </div>
    </div>
  );
}
