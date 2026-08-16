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
  shortDescription: z.string().trim().min(1).max(300),
  longDescriptionHtml: z.string().trim().min(1),
  howToUse: z.array(z.string().trim().min(1)).default([]),
  badge: z.enum(["bestseller", "new", "sale"]).optional().nullable(),
  inStock: z.boolean().default(true),
  inventoryCount: z.number().int().min(0).default(0),
  isPublished: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
  images: z.array(imageSchema).default([]),
  variants: z.array(variantSchema).default([]),
});

export const productUpdateSchema = productCreateSchema.partial();

export type ProductCreateInput = z.infer<typeof productCreateSchema>;
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;
