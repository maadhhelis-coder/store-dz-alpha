import { z } from "zod";

export const offerCreateSchema = z.object({
  title: z.string().trim().min(2).max(150),
  triggerProductId: z.string().uuid(),
  offerProductId: z.string().uuid(),
  offerPriceDzd: z.number().int().min(0),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
});

export type OfferCreateInput = z.infer<typeof offerCreateSchema>;

// التحديث جزئي فعلًا: الحقل الغائب يعني «لا تلمسه». `.partial()` وحدها لا تكفي —
// تُبقي ZodDefault داخل ZodOptional فيصل الافتراضي للخادم رغم غياب المفتاح، فيُصفَّر
// حقل لم يرسله أحد. (نفس الفخّ محا صور المنتجات فعليًا — راجع productSchema.ts.)
export const offerUpdateSchema = offerCreateSchema.partial().extend({
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export type OfferUpdateInput = z.infer<typeof offerUpdateSchema>;
