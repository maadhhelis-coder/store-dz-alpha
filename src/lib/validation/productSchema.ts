import { z } from "zod";

const imageSchema = z.object({
  url: z.string().url(),
  altText: z.string().max(200).optional(),
  sortOrder: z.number().int().default(0),
});

const variantSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(60),
  value: z.string().trim().min(1).max(60),
  sku: z.string().trim().max(60).optional(),
  priceOverrideDzd: z.number().int().min(1).optional(),
  inventoryCount: z.number().int().min(0).default(0),
  sortOrder: z.number().int().default(0),
});

// الحقول ذات الافتراضيات مُعرَّفة مرة واحدة: الإنشاء يضيف .default() والتحديث
// يضيف .optional() — فلا تتفرّق قواعد التحقق بين المخططين.
const howToUseField = z.array(z.string().trim().min(1));
const inStockField = z.boolean();
const inventoryCountField = z.number().int().min(0);
const isPublishedField = z.boolean();
const sortOrderField = z.number().int();
const imagesField = z.array(imageSchema);
const variantsField = z.array(variantSchema);

export const productCreateSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1, "الرابط مطلوب")
    .regex(/^[a-z0-9-]+$/, "الرابط يجب أن يحتوي أحرف لاتينية صغيرة وأرقام وشرطات فقط"),
  name: z.string().trim().min(1, "الاسم مطلوب").max(200),
  categoryId: z.string().uuid("اختر تصنيفًا"),
  priceDzd: z.number().int().min(1),
  oldPriceDzd: z.number().int().min(0).optional().nullable(),
  costDzd: z.number().int().min(0).optional().nullable(),
  shortDescription: z.string().trim().min(1).max(300),
  longDescriptionHtml: z.string().trim().min(1),
  howToUse: howToUseField.default([]),
  badge: z.enum(["bestseller", "new", "sale"]).optional().nullable(),
  inStock: inStockField.default(true),
  inventoryCount: inventoryCountField.default(0),
  isPublished: isPublishedField.default(true),
  sortOrder: sortOrderField.default(0),
  images: imagesField.default([]),
  variants: variantsField.default([]),
});

// التحديث جزئي فعلًا: الحقل الغائب يعني «لا تلمسه»، لا «أعده لقيمته الافتراضية».
// `.partial()` وحدها لا تكفي — تُبقي ZodDefault داخل ZodOptional فيصل الافتراضي
// للخادم رغم غياب المفتاح. الأثر الفعلي المُثبت: ProductForm لا يرسل images
// إطلاقًا (الصور تُدار عبر مسار مستقل)، فكان يصل images: [] إلى updateProduct
// فيمرّ شرط `if (images)` ويمحو كل صور المنتج مع كل ضغطة «حفظ التغييرات» — 15 ملفًا
// في المخزن مقابل صفر صفوف في product_images. ونفس الفخّ ينطبق على كل حقل ذي
// افتراضي (inStock، inventoryCount، isPublished، sortOrder، variants) لأي عميل
// يرسل PATCH جزئيًا — ومنهم الوكيل الخارجي عبر x-api-key.
export const productUpdateSchema = productCreateSchema.partial().extend({
  howToUse: howToUseField.optional(),
  inStock: inStockField.optional(),
  inventoryCount: inventoryCountField.optional(),
  isPublished: isPublishedField.optional(),
  sortOrder: sortOrderField.optional(),
  images: imagesField.optional(),
  variants: variantsField.optional(),
});

export type ProductCreateInput = z.infer<typeof productCreateSchema>;
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;
