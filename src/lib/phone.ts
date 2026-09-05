// تطبيع الهاتف الجزائري — التطبيق الوحيد في المشروع (Single Source of Truth).
// الصيغة القانونية للـCRM: 0XXXXXXXXX (محلي 10 أرقام).
// مطابقة العملاء/كشف التكرار/ربط الطلبات/البحث/حسابات المخاطر تعمل كلها على
// هذه الصيغة حصرًا — لا مطابقة ضبابية أبدًا (fuzzy matching ممنوع معماريًا).

const CANONICAL_PATTERN = /^0[5-7][0-9]{8}$/;

/** يطبع أي صيغة إدخال جزائرية شائعة إلى الصيغة القانونية 0XXXXXXXXX، أو null عند الفشل.
 *
 * المدخلات المقبولة (مع مسافات/شرطات/أقواس أو بدونها):
 *  - 05/06/07 + 8 أرقام (محلي)
 *  - +213 5/6/7 + 8 أرقام (دولي)
 *  - 00213 5/6/7 + 8 أرقام (بادئة الاتصال الدولية)
 *  - 213 5/6/7 + 8 أرقام (بدون +)
 *
 * الإرجاع null = رقم غير صالح (طول خاطئ، بادئة غير جزائرية، بادئة مشغّيل غير
 * صحيحة) — الرفض الحتمي أفضل من التخمين.
 */
export function normalizeAlgerianPhone(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;

  // إزالة كل ما ليس رقمًا (مسافات، شرطات، أقواس، +، نقاط…) — ثم منطق البادئات
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.length === 0) return null;

  // محلي صحيح أصلًا: 05XXXXXXXX / 06XXXXXXXX / 07XXXXXXXX
  if (CANONICAL_PATTERN.test(digits)) return digits;

  // دولي ببادئة الاتصال 00: 002135XXXXXXXX → 05XXXXXXXX
  if (digits.startsWith("00213")) {
    const local = "0" + digits.slice(5);
    return CANONICAL_PATTERN.test(local) ? local : null;
  }

  // دولي: +213 / 213 → 0 + 9 أرقام
  if (digits.startsWith("213")) {
    const local = "0" + digits.slice(3);
    return CANONICAL_PATTERN.test(local) ? local : null;
  }

  return null;
}

/** مثل normalizeAlgerianPhone لكنها ترمي خطأً واضحًا — للاستخدام في zod refine
 * ومسارات الإدخال التي يجب أن تفشل بصوت عالٍ لا بصمت. */
export function normalizeAlgerianPhoneOrThrow(raw: string): string {
  const normalized = normalizeAlgerianPhone(raw);
  if (normalized === null) {
    throw new Error(`رقم هاتف جزائري غير صالح: ${raw}`);
  }
  return normalized;
}

/** صيغة E.164 للعرْض على المزوّدين الخارجيين فقط (Meta CAPI/TikTok/DHD...) —
 * لا تُخزَّن أبدًا كلقب مطابقة؛ المطابقة بالقانونية المحلية وحدها. */
export function toE164(canonicalPhone: string): string | null {
  const normalized = normalizeAlgerianPhone(canonicalPhone);
  return normalized === null ? null : `+213${normalized.slice(1)}`;
}

/** صيغة القراءة: آخر رقمين ظاهرين فقط للسجلات/التصدير (05*******89). */
export function maskPhoneForDisplay(canonicalPhone: string): string {
  const normalized = normalizeAlgerianPhone(canonicalPhone);
  if (normalized === null) return "[REDACTED]";
  return `${normalized.slice(0, 2)}${"*".repeat(7)}${normalized.slice(-2)}`;
}
