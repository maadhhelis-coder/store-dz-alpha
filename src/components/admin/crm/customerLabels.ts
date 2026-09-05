// تسميات عربية لقيم enum الخاصة بالعملاء — مصدر واحد تستهلكه قائمة العملاء
// وملف الـ360 معًا. أساس كل رقم مالي ليس هنا: مصدره الرسمي METRIC_BASIS_LABELS
// في metrics/definitions.ts ولا يُنسخ.

export const RISK_LABELS: Record<string, string> = {
  low: "منخفضة",
  medium: "متوسطة",
  high: "مرتفعة",
  very_high: "مرتفعة جدًا",
};

export const STATUS_LABELS: Record<string, string> = {
  active: "نشط",
  blacklisted: "قائمة سوداء",
  archived: "مؤرشف (مدموج)",
};

export const SEGMENT_LABELS: Record<string, string> = {
  vip: "VIP",
  new_customer: "عميل جديد",
  repeat_customer: "متكرر",
  loyal: "وفيّ",
  inactive: "خامل",
  at_risk: "معرّض للفقدان",
  high_risk: "مخاطرة عالية",
  high_rto: "إرجاع مرتفع",
  profitable: "مربح",
  unprofitable: "غير مربح",
};

export const TIMELINE_TYPE_LABELS: Record<string, string> = {
  order_status: "حالة طلب",
  confirmation_attempt: "محاولة تأكيد",
  communication: "اتصال",
  task: "مهمة",
};
