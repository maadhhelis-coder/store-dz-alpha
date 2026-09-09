import Image from "next/image";

// أيقونات الضمانات — صفحة المنتج فقط (طلب صريح: لا تظهر في أي مكان آخر من
// المتجر). الترتيب كما أُرسلت. الصور شفّافة الخلفية فتذوب في خلفية الصفحة.
// الحاسوب: أربع بجانب بعضها. الهاتف: 2×2.
//
// الأربعة مقصوصة من ورقة واحدة كمربّعات *متطابقة الأبعاد* (557×557) وكل دائرة في
// مركز مربّعها. النسخة السابقة كانت أربعة ملفات بنسب مختلفة (1448×1086،
// 1359×1157، 1536×1024، 1254×1254) فرسمها h-auto بارتفاعات مختلفة — هذا سبب
// «معوجين». مع مربّع واحد للأربعة يستحيل الاعوجاج هندسيًا.
//
// الأسماء لم تعد مرسومة داخل الصور: نص أبيض بخط عادي تحت كل أيقونة (طلب صريح).

const ICONS = [
  { src: "/images/trust/icon-exchange.png", label: "الاستبدال في حالة العيب" },
  { src: "/images/trust/icon-delivery.png", label: "التوصيل إلى جميع الولايات" },
  { src: "/images/trust/icon-whatsapp.png", label: "تأكيد الطلب عبر واتساب" },
  { src: "/images/trust/icon-cod.png", label: "الدفع عند الاستلام" },
];

const ICON_SIZE = 557;

export default function TrustIconsRow() {
  return (
    // مسافة أوسع عن الإطار الكبير فوقها، وقريبة من شريط الروابط السريعة تحتها
    // (طلب صريح).
    <section aria-label="ضمانات المتجر" className="container-page pt-16 pb-2 md:pt-20 md:pb-3">
      <div className="grid grid-cols-2 gap-x-6 gap-y-7 md:grid-cols-4 md:gap-x-8">
        {ICONS.map((icon) => (
          <figure key={icon.src} className="flex flex-col items-center gap-3">
            <Image
              src={icon.src}
              alt={icon.label}
              width={ICON_SIZE}
              height={ICON_SIZE}
              sizes="(min-width: 768px) 160px, 40vw"
              className="h-auto w-full max-w-[160px] object-contain"
            />
            <figcaption className="text-center text-xs md:text-sm font-normal leading-snug text-white">
              {icon.label}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
