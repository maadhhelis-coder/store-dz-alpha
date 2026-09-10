import { z } from "zod";

export const categoryCreateSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9-]+$/, "الرابط يجب أن يحتوي فقط على أحرف إنجليزية صغيرة وأرقام وشرطات"),
  name: z.string().trim().min(2).max(120),
  shortDescription: z.string().trim().max(300).optional(),
  description: z.string().trim().max(2000).optional(),
  imageUrl: z.string().trim().url().optional(),
  icon: z.string().trim().max(50).optional(),
  sortOrder: z.number().int().min(0).default(0),
});

export type CategoryCreateInput = z.infer<typeof categoryCreateSchema>;

// التحديث جزئي فعلًا: الحقل الغائب يعني «لا تلمسه». `.partial()` وحدها لا تكفي —
// تُبقي ZodDefault داخل ZodOptional فيصل الافتراضي للخادم رغم غياب المفتاح، فيُصفَّر
// حقل لم يرسله أحد. (نفس الفخّ محا صور المنتجات فعليًا — راجع productSchema.ts.)
export const categoryUpdateSchema = categoryCreateSchema.partial().extend({
  sortOrder: z.number().int().min(0).optional(),
});

export type CategoryUpdateInput = z.infer<typeof categoryUpdateSchema>;
