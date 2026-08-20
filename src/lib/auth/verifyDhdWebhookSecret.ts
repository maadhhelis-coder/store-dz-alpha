import { timingSafeEqual } from "crypto";

// نفس مبدأ verifyCronSecret (فشل مغلق + مقارنة زمن-ثابت) — لكن السر هنا يُقرَأ من مُعامِل
// رابط (?secret=...) بدل هيدر Authorization، لأن منصات الطرف الثالث (مثل لوحة DHD) عادةً
// لا تسمح بضبط هيدرز مخصّصة عند تسجيل رابط Webhook، فقط الرابط نفسه.
export function verifyDhdWebhookSecret(request: Request): boolean {
  const secret = process.env.DHD_WEBHOOK_SECRET;
  if (!secret) return false;

  const url = new URL(request.url);
  const provided = Buffer.from(url.searchParams.get("secret") ?? "");
  const expected = Buffer.from(secret);

  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}
