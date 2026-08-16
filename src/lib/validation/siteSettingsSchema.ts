import { z } from "zod";

// معرّفات بكسلات التتبع تُحقن مباشرة داخل <script> (TrackingPixels.tsx) بلا أي تعقيم —
// نقيّدها بأحرف/أرقام/شرطات فقط لمنع كسر السلسلة النصية وحقن جافاسكريبت (XSS مخزّن).
const pixelIdSchema = z
  .string()
  .trim()
  .max(100)
  .regex(/^[A-Za-z0-9_-]*$/, "معرف غير صالح — أحرف إنجليزية وأرقام وشرطات فقط")
  .optional()
  .nullable();

export const siteSettingsUpdateSchema = z.object({
  logoUrl: z.string().trim().max(500).optional().nullable(),
  faviconUrl: z.string().trim().max(500).optional().nullable(),
  announcementBarText: z.string().trim().max(300).optional().nullable(),
  announcementBarEnabled: z.boolean().optional(),
  instagramUrl: z.string().trim().max(300).optional().nullable(),
  facebookUrl: z.string().trim().max(300).optional().nullable(),
  tiktokUrl: z.string().trim().max(300).optional().nullable(),
  privacyPolicyText: z.string().trim().max(20000).optional().nullable(),
  thankYouMessage: z.string().trim().max(1000).optional().nullable(),
  thankYouPageUrl: z.string().trim().max(500).optional().nullable(),
  storeDomain: z.string().trim().max(255).optional().nullable(),
  funnelsDomain: z.string().trim().max(255).optional().nullable(),
  metaPixelId: pixelIdSchema,
  metaCapiAccessToken: z.string().trim().max(500).optional().nullable(),
  tiktokEventsApiAccessToken: z.string().trim().max(500).optional().nullable(),
  metaAdAccountId: z.string().trim().max(60).optional().nullable(),
  metaAdsInsightsAccessToken: z.string().trim().max(500).optional().nullable(),
  tiktokAdvertiserId: z.string().trim().max(60).optional().nullable(),
  tiktokAdsReportAccessToken: z.string().trim().max(500).optional().nullable(),
  tiktokPixelId: pixelIdSchema,
  googleTagId: pixelIdSchema,
  snapchatPixelId: pixelIdSchema,
  notifyOrders: z.boolean().optional(),
  notifyPlatformUpdates: z.boolean().optional(),
  notifyAlerts: z.boolean().optional(),
  notifySystem: z.boolean().optional(),
  spamProtectionEnabled: z.boolean().optional(),
  orderLimitPerDevice: z.number().int().min(1).max(100).optional(),
  orderLimitPerPhone: z.number().int().min(1).max(100).optional(),
  orderLimitPerEmail: z.number().int().min(1).max(100).optional(),
  orderLimitPerName: z.number().int().min(1).max(100).optional(),
  orderLimitWindowMin: z.number().int().min(1).max(1440).optional(),
});

export type SiteSettingsUpdateInput = z.infer<typeof siteSettingsUpdateSchema>;
