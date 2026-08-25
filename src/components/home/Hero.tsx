import BrandImage from "@/components/brand/BrandImage";

// "Store DZ" + الشعار الحقيقي، بين خطين ذهبيين متدرّجين وبلون متلألئ (طلب صريح) —
// بنفس أسلوب فاصل "المنتجات" فـpage.tsx. h1 هنا هو نفسه النص الظاهر (وليس sr-only كما
// كان مؤقتًا) الآن بعد وصول ملف الشعار الحقيقي.
// الشعار المستعمَل هنا هو علامة "S" فقط (نفس /images/brand/logo-on-black.png المستعملة
// أصلاً فـHeader/Footer)، وليس الشارة الدائرية الكاملة (التي تحمل كتابة "STORE DZ" داخلها
// أصلاً) — لتفادي تكرار الكتابة مرتين جنبًا إلى جنب. الشارة الكاملة محفوظة كأصل حقيقي
// فـ/images/brand/logo-badge.png لاستعمالات أخرى (بروفايل واتساب للأعمال، إلخ).
// صورة الغلاف أدناها ممتدة حافة إلى حافة بلا إطار ذهبي وبلا أي مسافة جانبية (طلب صريح)،
// بنسبة أبعاد 3/2 مطابقة تمامًا لأبعاد الصورة الأصلية (1536×1024) — أي نسبة أخرى تقص جزءًا
// من التصميم لم يُطلَب قصّه.
export default function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-gold/15">
      <div className="container-page py-6 text-center">
        <div className="max-w-xs mx-auto h-px bg-gradient-to-r from-transparent via-gold to-transparent" />
        <div className="flex items-center justify-center gap-3 my-3">
          <BrandImage
            src="/images/brand/logo-on-black.png"
            alt="Store DZ"
            width={96}
            height={96}
            className="w-10 h-10 md:w-12 md:h-12 rounded-full"
          />
          <h1 className="font-display text-2xl md:text-3xl font-extrabold gold-gradient-text">
            Store DZ
          </h1>
        </div>
        <div className="max-w-xs mx-auto h-px bg-gradient-to-r from-transparent via-gold to-transparent" />
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
