import { CreditCard, RefreshCw, ShoppingBasket, Truck } from "lucide-react";

// شريط ضمانات فوق خط الفوتر الذهبي مباشرة: دائرة ذهبية بأيقونة داخلها والاسم
// تحتها. مرسوم بالـCSS لا بصور — نفس الشكل المطلوب تمامًا (بلا خلفية سوداء
// مربّعة)، يبقى حادًّا على أي مقاس، ويوفّر ~3.5MB كانت أربع صور 1024×1024.
// الحاسوب: أربعة بجانب بعضها. الهاتف: 2×2.

const ITEMS = [
  { Icon: CreditCard, label: "الدفع عند الاستلام" },
  { Icon: ShoppingBasket, label: "تأكيد الطلب عبر واتساب" },
  { Icon: Truck, label: "التوصيل إلى جميع الولايات" },
  { Icon: RefreshCw, label: "الاستبدال في حالة العيب" },
];

export default function TrustIconsRow() {
  return (
    <section aria-label="ضمانات المتجر" className="container-page pb-8">
      <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
        {ITEMS.map(({ Icon, label }) => (
          <div key={label} className="flex flex-col items-center gap-3 text-center">
            <span className="grid place-items-center w-20 h-20 md:w-24 md:h-24 rounded-full border-2 border-gold gold-glow">
              <Icon className="w-8 h-8 md:w-10 md:h-10 text-gold" strokeWidth={1.8} />
            </span>
            <span className="text-xs md:text-sm font-semibold text-cream leading-snug">{label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
