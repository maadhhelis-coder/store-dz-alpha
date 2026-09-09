import Image from "next/image";

// أيقونات الضمانات — صفحة المنتج فقط (طلب صريح: لا تظهر في أي مكان آخر من
// المتجر). الترتيب كما أُرسلت. الصور شفّافة الخلفية فتذوب في خلفية الصفحة.
// الحاسوب: أربع بجانب بعضها. الهاتف: 2×2.

const ICONS = [
  { src: "/images/trust/icon-exchange.png", alt: "الاستبدال في حالة العيب", w: 1448, h: 1086 },
  { src: "/images/trust/icon-delivery.png", alt: "التوصيل إلى جميع الولايات", w: 1359, h: 1157 },
  { src: "/images/trust/icon-whatsapp.png", alt: "تأكيد الطلب عبر واتساب", w: 1536, h: 1024 },
  { src: "/images/trust/icon-cod.png", alt: "الدفع عند الاستلام", w: 1254, h: 1254 },
];

export default function TrustIconsRow() {
  return (
    <section aria-label="ضمانات المتجر" className="container-page pt-10 pb-8">
      <div className="grid grid-cols-2 gap-5 md:grid-cols-4 md:gap-8">
        {ICONS.map((icon) => (
          <Image
            key={icon.src}
            src={icon.src}
            alt={icon.alt}
            width={icon.w}
            height={icon.h}
            sizes="(min-width: 768px) 25vw, 50vw"
            className="h-auto w-full object-contain"
          />
        ))}
      </div>
    </section>
  );
}
