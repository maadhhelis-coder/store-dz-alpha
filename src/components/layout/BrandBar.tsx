import BrandImage from "@/components/brand/BrandImage";

// شريط ثابت أعلى المتجر تحت الهيدر — طلب صريح: إزالة الشريط المتحرك نهائيًا (بعد محاولات
// عدة لضبط سرعته لم تُجدِ، والسبب الأرجح أداء حقيقي فأجهزة أضعف لا يمكن لأي ضبط CSS
// تجاوزه). شعار + نص فقط، بلا أي حركة إطلاقًا. حجم متدرّج حسب الشاشة (أكبر قليلاً بالحاسوب،
// مناسب لحجم شاشة الهاتف) — لا داعي بعد الآن لعرض ثابت بلا breakpoints (كان ذلك خاصًّا
// بضمان سرعة px/s ثابتة للحركة، ولم تعد هناك حركة). "لامعة وجذابة": التدرّج الذهبي
// (gold-gradient-text) نفسه المُستعمَل فمواضع أخرى فالمتجر للنص، وتوهج ذهبي خفيف حول الشعار.
export default function BrandBar() {
  return (
    <div className="w-full bg-gradient-to-r from-black via-ink-light to-black py-3 md:py-4">
      <div className="container-page flex flex-wrap items-center justify-center gap-2.5 sm:gap-3 md:gap-4 text-center">
        <BrandImage
          src="/images/brand/logo-badge.png"
          alt="شعار Store DZ"
          width={120}
          height={120}
          priority
          className="h-8 sm:h-10 md:h-12 lg:h-14 w-auto shrink-0 rounded-full drop-shadow-[0_0_10px_rgba(212,175,55,0.6)]"
        />
        <span className="font-display text-sm sm:text-base md:text-lg lg:text-xl font-bold gold-gradient-text leading-snug">
          منتجات تختارها بثقة وتوصلك أينما كنت
        </span>
      </div>
    </div>
  );
}
