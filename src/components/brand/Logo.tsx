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
// الحل: قصّ تلك الحافة الخارجية بتكبير الصورة (scale) داخل غلاف overflow-hidden دائري.
// ملاحظة مهمة: محاولة سابقة استعملت فئة Tailwind (scale-[1.14]) لكن getComputedStyle أثبتت
// عمليًا أنها لم تُطبَّق إطلاقًا (transform: none) — على الأرجح تعارض فبناء/تنقية Tailwind
// v4 لفئة scale الاعتباطية هذه فهذا المشروع تحديدًا. style مضمّن هنا بدل الفئة لضمان التطبيق
// الفعلي دون الاعتماد على سلوك غير مؤكَّد لأداة البناء.
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
          className="w-full h-full object-cover"
          style={{ transform: "scale(1.3)" }}
          priority
        />
      </span>
      <span className={cn("font-display font-bold text-lg tracking-wide text-cream", textClassName)}>
        STORE <span className="gold-gradient-text">DZ</span>
      </span>
    </Link>
  );
}
