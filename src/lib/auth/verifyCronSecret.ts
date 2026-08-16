import { timingSafeEqual } from "crypto";

// يفشل مغلقًا: لو CRON_SECRET غير مضبوط، كل الطلبات تُرفض (بلا هذا، `if (secret && ...)`
// كانت تتخطى الفحص بالكامل عند غياب المتغيّر — أي شخص يقدر يستدعي مسار الـcron). المقارنة
// زمن-ثابت لمنع قياس فرق التوقيت لاستنتاج السر تدريجيًا.
export function verifyCronSecret(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const authHeader = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const provided = Buffer.from(authHeader);
  const expectedBuf = Buffer.from(expected);

  if (provided.length !== expectedBuf.length) return false;
  return timingSafeEqual(provided, expectedBuf);
}
