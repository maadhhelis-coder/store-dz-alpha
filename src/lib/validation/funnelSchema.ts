import { z } from "zod";

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const funnelCreateSchema = z.object({
  slug: z.string().trim().min(2).max(100).regex(slugRegex, "الرابط يجب أن يحتوي أحرف لاتينية صغيرة وأرقام وشرطات فقط"),
  title: z.string().trim().min(2).max(150),
  productId: z.string().uuid(),
  pageType: z.enum(["funnel", "product_page"]).default("funnel"),
  headline: z.string().trim().min(2).max(200),
  subheadline: z.string().trim().max(300).optional(),
  heroImageUrl: z.string().trim().max(500).optional(),
  bullets: z.array(z.string().trim().min(1).max(200)).max(10).default([]),
  ctaText: z.string().trim().min(1).max(50).default("اطلب الآن"),
  isPublished: z.boolean().default(true),
});

export type FunnelCreateInput = z.infer<typeof funnelCreateSchema>;

export const funnelUpdateSchema = funnelCreateSchema.partial();

export type FunnelUpdateInput = z.infer<typeof funnelUpdateSchema>;
