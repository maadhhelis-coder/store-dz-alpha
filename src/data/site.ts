export const SITE_NAME = "Store DZ";
// يُقرأ من NEXT_PUBLIC_SITE_URL — بمجرد شراء دومين نهائي وتعيين المتغير على Vercel، يتحول
// الموقع بالكامل (sitemap، JsonLd، روابط canonical...) للدومين الجديد بلا أي تعديل كود.
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://storedz.one";
export const SITE_TAGLINE = "منتجات أصلية بضمان حقيقي، توصيل لكل ولايات الجزائر";

export const WHATSAPP_NUMBER = "213562848812";
export const WHATSAPP_DISPLAY = "0562 84 88 12";

export const INSTAGRAM_URL = "https://www.instagram.com/store_dz51";
export const FACEBOOK_URL =
  "https://www.facebook.com/profile.php?id=61590403662522";

// رقم تسويقي فقط (شريط الثقة، الهيرو، الفوتر، صفحات التواصل والشروط) — لا علاقة له بمنطق
// استمارة الطلب الفعلي (بيانات الولايات/البلديات/أسعار DHD فـ src/data/delivery.ts تبقى
// كما هي، 58 ولاية حقيقية، غير متأثرة بهذا الثابت إطلاقًا).
export const WILAYA_COUNT = 69;

export const NAV_LINKS = [
  { href: "/", label: "الرئيسية" },
  { href: "/products", label: "المنتجات" },
  { href: "/contact", label: "تواصل معنا" },
] as const;

// مُركزَّة هنا (بدل تكرارها فFooter.tsx وMobileNav.tsx) — تُستعمَل فكلا المكانين.
export const ABOUT_STORE_LINKS = [
  { href: "/about", label: "عن المتجر" },
  { href: "/payment-methods", label: "طرق الدفع" },
  { href: "/shipping-delivery", label: "الشحن والتسليم" },
  { href: "/faq", label: "الأسئلة الشائعة" },
] as const;

export const POLICY_LINKS = [
  { href: "/terms-of-service", label: "شروط الاستخدام" },
  { href: "/return-policy", label: "سياسة الاستبدال والاسترجاع" },
  { href: "/privacy-policy", label: "سياسة الخصوصية" },
] as const;

export const TRUST_BADGES = [
  {
    id: "authentic",
    icon: "badge-check",
    title: "منتجات أصلية 100%",
    description: "جميع منتجاتنا مضمونة وأصلية بنسبة 100%",
  },
  {
    id: "delivery",
    icon: "truck",
    title: `توصيل سريع لـ ${WILAYA_COUNT} ولاية`,
    description: "نوصل طلبك أينما كنت في الجزائر",
  },
  {
    id: "cod",
    icon: "hand-coins",
    title: "الدفع عند الاستلام",
    description: "ادفع فقط عند استلام طلبك، بدون أي مخاطرة",
  },
  {
    id: "support",
    icon: "headset",
    title: "خدمة عملاء سريعة الرد",
    description: "فريقنا يرد على استفساراتك عبر واتساب في أقرب وقت",
  },
] as const;

export const GUARANTEES = [
  {
    id: "refund",
    icon: "badge-percent",
    title: "ضمان استرداد الأموال",
    description: "منتج به عيب أو غير مطابق؟ استبدال أو استرداد كامل خلال 48 ساعة من الاستلام.",
  },
  {
    id: "privacy",
    icon: "lock",
    title: "لا تدفع شيئًا الآن",
    description:
      "الدفع عند الاستلام فقط — تعاين طلبك بين يديك قبل ما تدفع أي دينار.",
  },
  {
    id: "after-sales",
    icon: "headset",
    title: "خدمة ما بعد البيع متوفرة",
    description:
      "فريق الدعم لدينا متاح لمساعدتك في أي وقت تحتاج فيه.",
  },
] as const;
