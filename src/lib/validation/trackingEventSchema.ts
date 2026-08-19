import { z } from "zod";

export const trackingEventSchema = z.object({
  eventType: z.enum(["page_view", "cta_click", "form_start", "form_submit"]),
  pageKind: z.enum(["product", "landing"]),
  path: z.string().trim().min(1).max(300),
  productSlug: z.string().trim().max(160).optional(),
  platform: z.enum(["facebook", "instagram", "tiktok"]).nullable().optional(),
  creativeName: z.string().trim().max(80).nullable().optional(),
  visitorId: z.string().trim().min(1).max(100),
});

export type TrackingEventInput = z.infer<typeof trackingEventSchema>;
