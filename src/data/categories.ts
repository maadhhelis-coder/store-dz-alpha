// نوع بيانات التصنيف فقط — البيانات الفعلية تُجلب من قاعدة البيانات عبر
// src/lib/storefrontData.ts، وليس من هنا (لم يعد هذا الملف يحتوي بيانات ثابتة).
export type Category = {
  slug: string;
  name: string;
  shortDescription: string;
  description: string;
  image: string;
  icon: "smartphone" | "shirt" | "home";
};
