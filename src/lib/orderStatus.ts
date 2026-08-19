import type { OrderStatus } from "@prisma/client";

export const ORDER_STATUS_META: Record<OrderStatus, { label: string; color: string }> = {
  pending: { label: "قيد الانتظار", color: "#cccccc" },
  confirmed: { label: "تأكيد الطلب", color: "#b6d7a8" },
  no_answer: { label: "لم يرد", color: "#ffe599" },
  callback: { label: "إعادة الاتصال", color: "#9fc5e8" },
  voicemail: { label: "البريد الصوتي", color: "#d5a6bd" },
  fake: { label: "طلب وهمي", color: "#e06666" },
  wrong_number: { label: "رقم هاتف غير صحيح", color: "#b3b3b3" },
  duplicate: { label: "طلب مكرر", color: "#f6b26b" },
  cancelled: { label: "إلغاء الطلب", color: "#ea9999" },
  shipped: { label: "تم الشحن", color: "#76a5af" },
  delivered: { label: "تم التسليم", color: "#6aa84f" },
  returned: { label: "مرتجع", color: "#a64d79" },
};

export const ORDER_STATUS_OPTIONS = Object.entries(ORDER_STATUS_META).map(([value, meta]) => ({
  value: value as OrderStatus,
  ...meta,
}));
