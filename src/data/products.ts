// أنواع بيانات المنتج فقط — البيانات الفعلية تُجلب من قاعدة البيانات عبر
// src/lib/storefrontData.ts، وليس من هنا (لم يعد هذا الملف يحتوي بيانات ثابتة).
export type ProductBadge = "الأكثر مبيعًا" | "جديد" | "عرض خاص";

export type ProductVariant = {
  id: string;
  name: string;
  value: string;
  priceDzd?: number;
  inStock: boolean;
};

export type Product = {
  id: string;
  slug: string;
  name: string;
  categorySlug: string;
  price: number;
  oldPrice?: number;
  shortDescription: string;
  longDescriptionHtml: string;
  howToUse: string[];
  images: string[];
  badge?: ProductBadge;
  inStock: boolean;
  // عدد حقيقي من المخزون الفعلي (Prisma) — يُملأ فقط عندما تكون الكمية منخفضة فعلًا
  // (نفس عتبة "على وشك النفاد" فلوحة التحكم)، لعرض إشارة ندرة صادقة بلا أرقام مُلفَّقة.
  lowStockCount?: number;
  variants: ProductVariant[];
};
