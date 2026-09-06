import type { OrderStatus } from "@prisma/client";

// آلة حالات الطلب — التطبيق الوحيد المصرَّح له بتغيير OrderStatus.
// لا route handler ولا UI ولا cron ولا webhook يعدّل الحالة مباشرةً أبدًا؛
// كل المسارات تستدعي assertTransition/applyTransitionThroughGuard.
//
// الحالات القديمة no_answer/callback/voicemail: قابلة للقراءة تاريخيًا فقط —
// لا انتقالات جديدة إليها إطلاقًا (نتائج الاتصال تعيش في confirmation_attempts).

export class InvalidTransitionError extends Error {
  readonly code = "INVALID_TRANSITION";
  readonly from: OrderStatus;
  readonly to: OrderStatus;

  constructor(from: OrderStatus, to: OrderStatus) {
    super(`انتقال حالة طلب غير مسموح: ${from} → ${to}`);
    this.name = "InvalidTransitionError";
    this.from = from;
    this.to = to;
  }
}

/** الحالات القديمة (للتوافق القرائي فقط) — أي محاولة كتابتها تُرفض صراحةً. */
export const LEGACY_READ_ONLY_STATUSES: readonly OrderStatus[] = ["no_answer", "callback", "voicemail"];

/** الحالات النهائية — لا انتقالات خارجة منها (إلا عبر مسارات موثقة صراحة أدناه). */
export const TERMINAL_STATUSES: readonly OrderStatus[] = [
  "cancelled",
  "fake",
  "duplicate",
  "wrong_number",
];

/** جدول الانتقالات المسموحة — مصدر الحقيقة. كل قيمة = قائمة وجهات مشروعة.
 * ملاحظات:
 * - returned→confirmed يُمنع هنا عمدًا: إعادة الشحن إجراء reship مخصص (بسبب
 *   إلزامي وصلاحية خاصة) لا انتقال حالة عامًا — راجع reshipAction (P5).
 * - return_to_origin→returned يُقفل دورة RTO عند استلام القطعة.
 * - delivered→cod_collected نقطة الفصل المالية (التسوية جدول مستقل تمامًا).
 */
const TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  pending: ["confirmed", "cancelled", "fake", "duplicate", "wrong_number", "fraud_suspected"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["ready_to_ship", "cancelled"],
  ready_to_ship: ["shipped", "cancelled"],
  shipped: ["in_transit", "out_for_delivery", "delivered", "return_to_origin"],
  in_transit: ["out_for_delivery", "delivered", "return_to_origin"],
  out_for_delivery: ["delivered", "return_to_origin"],
  delivered: ["cod_collected", "returned"],
  cod_collected: ["returned"],
  return_to_origin: ["returned"],
  returned: [], // إعادة الشحن عبر إجراء reship المخصص فقط
  cancelled: [],
  fake: [],
  duplicate: [],
  wrong_number: [],
  fraud_suspected: ["cancelled", "pending"], // نتيجة المراجعة اليدوية
  // قيم قديمة — لا خروج منها (صفوف تاريخية فقط)
  no_answer: [],
  callback: [],
  voicemail: [],
};

/** الاستثناء الوحيد الموثّق للجدول أعلاه: إعادة الشحن تُعيد طلبًا مرتجعًا إلى
 * الدورة. ليس انتقالًا عامًا — لا يُفتح إلا بعلم صريح من خدمة الـreship وحدها
 * (صلاحية shipments.reship + سبب إلزامي + توثيق)، ويبقى مرفوضًا لكل مستدعٍ آخر. */
const RESHIP_TRANSITION = { from: "returned" as OrderStatus, to: "confirmed" as OrderStatus };

export type TransitionOptions = { allowReship?: boolean };

/** هل الانتقال مسموح؟ (بدون تنفيذ) */
export function isTransitionAllowed(
  from: OrderStatus,
  to: OrderStatus,
  options: TransitionOptions = {},
): boolean {
  if (from === to) return false;
  if (LEGACY_READ_ONLY_STATUSES.includes(to)) return false;
  if (options.allowReship && from === RESHIP_TRANSITION.from && to === RESHIP_TRANSITION.to) {
    return true;
  }
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** يتحقق من الانتقال ويرمي InvalidTransitionError عند الرفض — يُستدعى داخل
 * خدمة تغيير الحالة قبل الـCAS (فشل سريع برسالة مفهومة قبل أي كتابة). */
export function assertTransition(
  from: OrderStatus,
  to: OrderStatus,
  options: TransitionOptions = {},
): void {
  if (!isTransitionAllowed(from, to, options)) {
    throw new InvalidTransitionError(from, to);
  }
}

/** هل الحالة من عائلة "قيد التنفيذ مع الناقل" — حالات تُحدَّث عادةً من mapping
 * الناقل أو cron المزامنة، وليست انتقالات تأكيد يدوية. */
export function isCarrierDrivenStatus(status: OrderStatus): boolean {
  return ["shipped", "in_transit", "out_for_delivery", "return_to_origin"].includes(status);
}

/** هل الحالة "بعد التسليم" — للمقاييس والفلاتر المالية. */
export function isPostDeliveryStatus(status: OrderStatus): boolean {
  return ["delivered", "cod_collected", "returned"].includes(status);
}

/** الحالات المعروضة في قائمة "بانتظار التأكيد" — الحالية + القديمة (عرض فقط). */
export const AWAITING_CONFIRMATION_STATUSES: readonly OrderStatus[] = [
  "pending",
  "no_answer",
  "callback",
  "voicemail",
];
