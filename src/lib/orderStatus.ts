import type { OrderStatus } from "@prisma/client";

// بيانات عرض الحالات — تشمل الحالات الجديدة والقديمة (قراءة/عرض فقط للقديمة:
// لا تُعرض في قوائم اختيار الكتابة — راجع writableOrderStatusSchema).

export const ORDER_STATUS_META: Record<OrderStatus, { label: string; color: string }> = {
  pending: { label: "قيد الانتظار", color: "#cccccc" },
  confirmed: { label: "تأكيد الطلب", color: "#b6d7a8" },
  preparing: { label: "قيد التحضير", color: "#b4a7d6" },
  ready_to_ship: { label: "جاهز للشحن", color: "#c9a7c7" },
  shipped: { label: "تم الشحن", color: "#76a5af" },
  in_transit: { label: "في الطريق", color: "#9fc5e8" },
  out_for_delivery: { label: "قيد التسليم", color: "#8e7cc3" },
  delivered: { label: "تم التسليم", color: "#6aa84f" },
  cod_collected: { label: "COD محصّل", color: "#38761d" },
  return_to_origin: { label: "مرجِع للمصدر", color: "#e69138" },
  returned: { label: "مرتجع", color: "#a64d79" },
  cancelled: { label: "إلغاء الطلب", color: "#ea9999" },
  fake: { label: "طلب وهمي", color: "#e06666" },
  wrong_number: { label: "رقم هاتف غير صحيح", color: "#b3b3b3" },
  duplicate: { label: "طلب مكرر", color: "#f6b26b" },
  fraud_suspected: { label: "اشتباه احتيال", color: "#cc4125" },
  // قديمة — عرض/قراءة فقط (نتائج الاتصال أصبحت في confirmation_attempts)
  no_answer: { label: "لم يرد (قديم)", color: "#ffe599" },
  callback: { label: "إعادة اتصال (قديم)", color: "#9fc5e8" },
  voicemail: { label: "بريد صوتي (قديم)", color: "#d5a6bd" },
};

export const ORDER_STATUS_OPTIONS = Object.entries(ORDER_STATUS_META).map(([value, meta]) => ({
  value: value as OrderStatus,
  ...meta,
}));

// خيارات الكتابة فقط — تُستعمل في قوائم تغيير الحالة (تستبعد القديمة عمدًا
// لتطابق writableOrderStatusSchema في orderSchema.ts)
const NON_WRITABLE: OrderStatus[] = ["no_answer", "callback", "voicemail"];

export const WRITABLE_ORDER_STATUS_OPTIONS = ORDER_STATUS_OPTIONS.filter(
  (option) => !NON_WRITABLE.includes(option.value),
);
