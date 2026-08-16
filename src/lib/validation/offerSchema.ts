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

export const offerUpdateSchema = offerCreateSchema.partial();

export type OfferUpdateInput = z.infer<typeof offerUpdateSchema>;
