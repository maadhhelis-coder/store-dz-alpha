import { createHmac, timingSafeEqual } from "crypto";

// موثَّق رسميًا من صفحة "Lire la documentation" داخل لوحة DHD (منصة EcoTrack) —
// HMAC-SHA256 على الـbody الخام (قبل أي JSON.parse)، بالسر المُدخَل عند إنشاء الـwebhook،
// ومرسَل فـهيدر "Signature" بصيغة "sha256=<hex>". هذا يُلغي الافتراض السابق (سر عبر
// معامل رابط ?secret=) الذي كان تخمينًا غير مؤكَّد.
//
// اكتُشف فعليًا (2026-09-12، ست محاولات اختبار من لوحة DHD): DHD لا ترسل هيدر Signature
// إطلاقًا مهما حُفظ في حقل Secret عندهم — فتوقيع HMAC غير قابل للاستعمال عمليًا. البديل
// المدعوم في لوحتهم: «En-têtes personnalisés» — هيدر X-Dhd-Token يحمل نفس السرّ المشترك.
// مقارنة بزمن ثابت، عبر HTTPS؛ يوثّق المرسل (لا سلامة الجسم) — كافٍ لهذه الحمولة.
// المساران مقبولان: HMAC إن أرسلوه يومًا، أو الهيدر.
export function verifyDhdWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  tokenHeader: string | null = null,
): boolean {
  const secret = process.env.DHD_WEBHOOK_SECRET;
  if (!secret) return false;

  if (tokenHeader) {
    const a = Buffer.from(tokenHeader.trim());
    const b = Buffer.from(secret);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  if (!signatureHeader) return false;

  const expectedHex = createHmac("sha256", secret).update(rawBody).digest("hex");
  const expected = Buffer.from(`sha256=${expectedHex}`);
  const provided = Buffer.from(signatureHeader);

  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}
