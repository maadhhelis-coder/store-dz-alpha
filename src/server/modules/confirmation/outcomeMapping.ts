import type { ConfirmationOutcome, OrderStatus } from "@prisma/client";

// الخريطة الحتمية: نتيجة اتصال → إجراء على الطلب (Correction 3/3.15).
// الدالة صرفة (قابلة للاختبار unit بلا DB) — التنفيذ الفعلي في confirmationService.

export type OutcomeAction =
  | { kind: "transition"; to: OrderStatus }
  | { kind: "stay_pending"; scheduleFollowUp: boolean }
  | { kind: "transition_with_task"; to: OrderStatus; taskType: "manual_review" };

/** النتائج التي تُبقي الطلب pending مع تحديث جدولة إعادة الاتصال. */
export const FOLLOW_UP_OUTCOMES: readonly ConfirmationOutcome[] = ["no_answer", "call_back"];

export function outcomeAction(outcome: ConfirmationOutcome): OutcomeAction {
  switch (outcome) {
    case "confirmed":
      return { kind: "transition", to: "confirmed" };
    case "no_answer":
    case "call_back":
      // الطلب يبقى pending + nextCallAt/callAttempts (منطق callAttempts انتقل
      // من انتقالات الحالة القديمة إلى هنا — Corrections 3/10)
      return { kind: "stay_pending", scheduleFollowUp: true };
    case "customer_requested_change":
      // تعديل بيانات يجري عبر updateOrderFields — الطلب يبقى pending
      return { kind: "stay_pending", scheduleFollowUp: false };
    case "wrong_number":
      return { kind: "transition", to: "wrong_number" };
    case "cancelled":
      return { kind: "transition", to: "cancelled" };
    case "duplicate":
      return { kind: "transition", to: "duplicate" };
    case "fraud_suspected":
      // مراجعة يدوية إلزامية — لا حظر تلقائي
      return { kind: "transition_with_task", to: "fraud_suspected", taskType: "manual_review" };
  }
}

/** ترتيب المخاطر للقائمة (الأعلى أولًا). */
export const RISK_SORT_RANK: Record<string, number> = {
  very_high: 3,
  high: 2,
  medium: 1,
  low: 0,
};
