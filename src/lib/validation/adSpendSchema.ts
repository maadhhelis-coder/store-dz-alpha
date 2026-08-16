import { z } from "zod";

export const adSpendCreateSchema = z.object({
  platform: z.enum(["facebook", "instagram", "tiktok"]),
  creativeName: z.string().trim().min(1).max(80),
  clicks: z.number().int().min(0).optional(),
  spendDzd: z.number().int().min(0).optional(),
});

export type AdSpendCreateInput = z.infer<typeof adSpendCreateSchema>;

export const adSpendUpdateSchema = z.object({
  clicks: z.number().int().min(0).optional(),
  spendDzd: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export type AdSpendUpdateInput = z.infer<typeof adSpendUpdateSchema>;
