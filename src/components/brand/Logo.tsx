import Link from "next/link";
import BrandImage from "@/components/brand/BrandImage";
import { SITE_NAME } from "@/data/site";
import { cn } from "@/lib/utils";

type LogoProps = {
  className?: string;
  size?: number;
  logoUrl?: string | null;
  imgClassName?: string;
  textClassName?: string;
};

// imgClassName/textClassName اختياريان (طلب صريح: تكبير لوغو الهيدر تحديدًا على الحاسوب) —
// يتجاوزان الحجم الافتراضي بصريًا عبر CSS بلا تغيير width/height الأصلية للصورة (نفس نمط
// BrandBar الحالي)، بلا التأثير على استخدامات Logo الأخرى (Footer، صفحة دخول لوحة التحكم)
// التي لا تمرّرهما فتبقى بحجمها الافتراضي كما هي. imgClassName يستهدف الآن الغلاف الخارجي
// (span) لا الصورة مباشرة — انظر تعليق overflow-hidden أدناه.
// طلب صريح لاحق: "الدائرة سوداء لا سوداء وفيها اضاءة صفراء" — حافة ملفّات اللوغو (المُعدّة
// خارجيًا) تُظهر حلقة/هالة خفيفة عند أقصى الحافة الدائرية. غلاف overflow-hidden + تكبير
// الصورة داخله (scale) يقصّ تلك الحافة الخارجية بلا التأثير على الشعار/النص المرئي في
// المنتصف (هامش داخلي كافٍ فكلا الملفين الحاليين). حلّ CSS بحت لا يحتاج تعديل ملفات الصور.
export default function Logo({ className, size = 44, logoUrl, imgClassName, textClassName }: LogoProps) {
  return (
    <Link
      href="/"
      className={cn("flex items-center gap-2 shrink-0", className)}
      aria-label={`${SITE_NAME} — الصفحة الرئيسية`}
    >
      <span className={cn("relative overflow-hidden rounded-full shrink-0 inline-block w-11 h-11", imgClassName)}>
        <BrandImage
          src={logoUrl || "/images/brand/logo-on-black.png"}
          alt={`شعار ${SITE_NAME}`}
          width={size}
          height={size}
          className="w-full h-full object-cover scale-[1.14]"
          priority
        />
      </span>
      <span className={cn("font-display font-bold text-lg tracking-wide text-cream", textClassName)}>
        STORE <span className="gold-gradient-text">DZ</span>
      </span>
    </Link>
  );
}
