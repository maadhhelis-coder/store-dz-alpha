// تنقية مركزية للبيانات الحساسة — تُستعمل في كل مسارات السجلات والتصدير
// (audit logs، structured logs، provider payloads، error messages).
// القاعدة: الأسرار لا تُسجَّل أبدًا؛ PII يُقنَّع حسب التصنيف.

import { maskPhoneForDisplay } from "@/lib/phone";

/** التصنيفات: PUBLIC (بيانات المنتجات) / INTERNAL (ملاحظات تشغيلية) /
 * SENSITIVE (هاتف/عنوان العميل) / SECRET (مفاتيح واعتمادات). */

const SECRET_KEY_PATTERNS: RegExp[] = [
  /password/i,
  /passphrase/i,
  /secret/i,
  /token/i,
  /api[-_]?key/i,
  /apikey/i,
  /access[-_]?key/i,
  /private[-_]?key/i,
  /authorization/i,
  /cookie/i,
  /credential/i,
  /refresh/i,
  /session/i,
];

const REDACTED = "[REDACTED]";

/** هل المفتاح يشير لهاتف عميل؟ (phone وليس phoneType مثلًا) */
function isPhoneKey(key: string): boolean {
  return /^(phone|customer_?phone|primary_?phone|phone_?normalized|alt_?phones?)$/i.test(key);
}

function isAddressLikeKey(key: string): boolean {
  return /(address|adresse)/i.test(key);
}

/** تنقية عميقة لأي كائن/مصفوفة/قيمة — تنشئ نسخة جديدة ولا تعدّل الأصل.
 * - مفاتيح الأسرار (token/secret/key/...) → [REDACTED]
 * - هواتف → 05*******89 (قناع جزئي يكفي للتشخيص دون كشف كامل)
 * - عناوين → أول 20 حرفًا + "…"
 */
export function redactForAudit<T>(input: T): T {
  return redactDeep(input, new WeakSet(), "");
}

function redactDeep<T>(value: T, seen: WeakSet<object>, keyContext: string): T {
  if (value === null || value === undefined) return value;

  if (typeof value === "string") {
    if (SECRET_KEY_PATTERNS.some((p) => p.test(keyContext))) return REDACTED as unknown as T;
    if (isPhoneKey(keyContext)) return maskPhoneForDisplay(value) as unknown as T;
    if (isAddressLikeKey(keyContext) && value.length > 24) {
      return (value.slice(0, 20) + "…") as unknown as T;
    }
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") return value;

  if (Array.isArray(value)) {
    if (seen.has(value)) return value;
    seen.add(value);
    return value.map((v) => redactDeep(v, seen, keyContext)) as unknown as T;
  }

  if (typeof value === "object") {
    if (seen.has(value as object)) return value;
    seen.add(value as object);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redactDeep(v, seen, k);
    }
    return out as unknown as T;
  }

  return value;
}

/** تنقية سطر سجل تشغيلي (structured log) — نفس سياسات الـaudit مع حد حجمي. */
export function redactForLogs<T>(input: T): T {
  return redactForAudit(input);
}

/** تنقية حمولة/استجابة مزوّد خارجي (DHD/Meta/TikTok/WhatsApp...) — تُطبَّق قبل
 * أي تخزين في shipment_events.rawPayload أو communications.providerResponse. */
export function redactProviderPayload<T>(input: T): T {
  return redactForAudit(input);
}

/** تنقية رسالة خطأ قبل تسجيلها — يمنع تسرّب tokens من رسائل المزوّدين. */
export function redactErrorMessage(message: string): string {
  // أنماط شائعة: Bearer xxx، token=xxx، key=xxx
  return message
    .replace(/(bearer\s+)[^\s"']+/gi, "$1[REDACTED]")
    .replace(/((?:api[-_]?key|token|secret|password|access[-_]?token)[=:]\s*)[^\s"']+/gi, "$1[REDACTED]")
    .replace(/0[5-7]\d{8}/g, (m) => maskPhoneForDisplay(m));
}
