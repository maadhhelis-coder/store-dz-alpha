import { z } from "zod";

export const couponCreateSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .transform((v) => v.toUpperCase()),
  type: z.enum(["percentage", "fixed"]),
  value: z.number().int().min(1),
  usageLimit: z.number().int().min(1).optional(),
  minOrderDzd: z.number().int().min(0).optional(),
  expiresAt: z.string().datetime().optional(),
});

export type CouponCreateInput = z.infer<typeof couponCreateSchema>;

export const couponUpdateSchema = z.object({
  isActive: z.boolean().optional(),
  usageLimit: z.number().int().min(1).nullable().optional(),
  minOrderDzd: z.number().int().min(0).nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

export type CouponUpdateInput = z.infer<typeof couponUpdateSchema>;
