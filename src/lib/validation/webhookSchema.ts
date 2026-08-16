import { z } from "zod";

// حماية SSRF أساسية — تمنع تسجيل webhook يستهدف عناوين داخلية/loopback صراحة عبر اسم
// المضيف الحرفي في الرابط. ليست حماية كاملة (لا تحل DNS فعليًا، فتُخدَع بإعادة توجيه أو
// DNS rebinding)، لكنها تسد أبسط وأخطر حالة استغلال: رابط يستهدف localhost/شبكة داخلية مباشرة.
const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^0\.0\.0\.0$/,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^\[?::1\]?$/,
  /^\[?fe80:/i,
  /\.local$/i,
  /\.internal$/i,
];

function isPrivateHost(hostname: string): boolean {
  return PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(hostname));
}

export const webhookCreateSchema = z.object({
  url: z
    .string()
    .trim()
    .url("رابط غير صحيح")
    .max(500)
    .refine((url) => {
      try {
        return new URL(url).protocol === "https:" || new URL(url).protocol === "http:";
      } catch {
        return false;
      }
    }, "يجب أن يبدأ الرابط بـ http:// أو https://")
    .refine((url) => {
      try {
        return !isPrivateHost(new URL(url).hostname);
      } catch {
        return false;
      }
    }, "لا يمكن استعمال رابط يشير لعنوان داخلي/محلي"),
  events: z.array(z.enum(["order_created", "order_status_changed"])).min(1),
});

export type WebhookCreateInput = z.infer<typeof webhookCreateSchema>;
