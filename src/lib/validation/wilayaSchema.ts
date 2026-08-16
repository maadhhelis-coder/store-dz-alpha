import { z } from "zod";

export const wilayaPricingUpdateSchema = z.object({
  wilayas: z
    .array(
      z.object({
        code: z.number().int().min(1).max(58),
        officePriceDzd: z.number().int().min(0).nullable(),
        homePriceDzd: z.number().int().min(0),
        isActive: z.boolean(),
      }),
    )
    .min(1)
    .max(58),
});

export type WilayaPricingUpdateInput = z.infer<typeof wilayaPricingUpdateSchema>;
