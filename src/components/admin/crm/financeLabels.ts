import type { CodSettlementStatus, ReturnReason, ReturnStatus } from "@prisma/client";

// تسميات عربية لكيانات P6 — مصدر واحد للواجهة.

export const RETURN_STATUS_LABELS: Record<ReturnStatus, string> = {
  open: "مفتوحة",
  in_return_transit: "في طريق العودة",
  received: "استُلمت",
  inspected: "فُحصت",
  partially_restocked: "استُرجعت جزئيًا",
  restocked: "استُرجعت كاملًا",
  closed: "مغلقة",
  rejected: "مرفوضة",
};

export const RETURN_REASON_LABELS: Record<ReturnReason, string> = {
  refused: "رفض الزبون",
  unreachable: "لا يمكن الوصول",
  address_issue: "مشكلة عنوان",
  delivery_failed: "فشل التسليم",
  damaged: "تالف",
  wrong_product: "منتج خاطئ",
  customer_cancelled: "ألغى الزبون",
  carrier_return: "إرجاع الناقل",
};

export const SETTLEMENT_STATUS_LABELS: Record<CodSettlementStatus, string> = {
  pending: "معلّقة",
  matched: "مطابقة",
  discrepancy: "بها فروق",
  resolved: "محلولة",
};

export const SETTLEMENT_ITEM_STATE_LABELS: Record<string, string> = {
  pending: "معلّق",
  matched: "مطابق",
  discrepancy: "فرق",
  resolved: "محلول",
  excluded: "مستثنى (اختبار)",
};

export const ADJUSTMENT_TYPE_LABELS: Record<string, string> = {
  full_refund: "استرداد كامل",
  partial_refund: "استرداد جزئي",
  shipping: "شحن",
  return: "إرجاع",
  other: "أخرى",
};

export const ADJUSTMENT_DIRECTION_LABELS: Record<string, string> = {
  credit: "دائن (+ربح)",
  debit: "مدين (−ربح)",
};

export function moment(value: Date | string): string {
  return new Date(value).toISOString().replace("T", " ").slice(0, 16);
}
