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
// طلب صريح لاحق: "الدائرة سوداء لا سوداء وفيها اضاءة صفراء" — تحقّق فعلي بقراءة بكسلات
// logo-on-black.png مباشرة (سكربت Node محلي، لا تخمين): الشعار الذهبي داخل هذا الملف غير
// مركزي تمامًا فقماشه المربّع، ويلامس فعليًا حتى 85% من نصف قطر الدائرة عند الأسفل (زوايا
// حول 90°) بلون أصفر ساطع صريح — هذا هو مصدر "الإضاءة الصفراء" الحقيقي، وليس مجرّد تصوّر.
// محاولة أولى كبّرت (scale>1) الصورة داخل الإطار الدائري لقصّ تلك الحافة — لكنها قصّت جزءًا
// من الشعار المرئي نفسه أيضًا (تأكيد صريح من المستخدم). طلب صريح لاحق: "الإزالة الكاملة
// للأصفر + بقاء الشعار كاملاً" معًا — الحل الصحيح هو العكس: تصغير (scale<1) بدل تكبير، بما
// يسحب الشعار كاملاً إلى الداخل بعيدًا عن حافة الدائرة (هامش أسود إضافي حول الشعار) بدل
// قصّ أي جزء منه. bg-black على الغلاف يضمن أن الهامش المُضاف أسود خالص فعليًا، لا شفافًا.
// ملاحظة: فئة Tailwind الاعتباطية (scale-[…]) أثبتت أنها لا تُطبَّق فعليًا فهذا المشروع
// (getComputedStyle: transform: none) — style مضمّن هنا بدلها لضمان التطبيق الفعلي.
export default function Logo({ className, size = 44, logoUrl, imgClassName, textClassName }: LogoProps) {
  return (
    <Link
      href="/"
      className={cn("flex items-center gap-2 shrink-0", className)}
      aria-label={`${SITE_NAME} — الصفحة الرئيسية`}
    >
      <span className={cn("relative overflow-hidden rounded-full shrink-0 inline-block w-11 h-11 bg-black", imgClassName)}>
        <BrandImage
          src={logoUrl || "/images/brand/logo-on-black.png"}
          alt={`شعار ${SITE_NAME}`}
          width={size}
          height={size}
          className="w-full h-full object-cover"
          style={{ transform: "scale(0.85)" }}
          priority
        />
      </span>
      <span className={cn("font-display font-bold text-lg tracking-wide text-cream", textClassName)}>
        STORE <span className="gold-gradient-text">DZ</span>
      </span>
    </Link>
  );
}
