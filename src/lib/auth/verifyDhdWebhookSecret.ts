import { createHmac, timingSafeEqual } from "crypto";

// موثَّق رسميًا من صفحة "Lire la documentation" داخل لوحة DHD (منصة EcoTrack) —
// HMAC-SHA256 على الـbody الخام (قبل أي JSON.parse)، بالسر المُدخَل عند إنشاء الـwebhook،
// ومرسَل فـهيدر "Signature" بصيغة "sha256=<hex>". هذا يُلغي الافتراض السابق (سر عبر
// معامل رابط ?secret=) الذي كان تخمينًا غير مؤكَّد.
export function verifyDhdWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.DHD_WEBHOOK_SECRET;
  if (!secret || !signatureHeader) return false;

  const expectedHex = createHmac("sha256", secret).update(rawBody).digest("hex");
  const expected = Buffer.from(`sha256=${expectedHex}`);
  const provided = Buffer.from(signatureHeader);

  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}
