import { z } from "zod";

// أسماء ومصطلحات مكتبة web-vitals القياسية نفسها — لا نخترع تصنيفًا موازيًا.
export const webVitalSchema = z.object({
  name: z.enum(["CLS", "FCP", "INP", "LCP", "TTFB"]),
  value: z.number().finite().min(0),
  rating: z.enum(["good", "needs-improvement", "poor"]),
  path: z.string().trim().min(1).max(300),
  visitorId: z.string().trim().min(1).max(100),
});

export type WebVitalInput = z.infer<typeof webVitalSchema>;
