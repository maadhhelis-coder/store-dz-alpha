import { z } from "zod";

// إعدادات CRM التشغيلية — key-value مع zod schema صارم لكل مفتاح.
// القواعد: crm_settings إعدادات تشغيلية فقط (لا صلاحيات RBAC أبدًا — تلك في
// role_permissions)؛ كل قيمة zod-validated عند القراءة والكتابة؛ كل تغيير
// موثّق (audit) عبر الـservice؛ version-tolerant (مفاتيح غير معروفة تُتجاهل).
// الـdefaults هنا هي القيم الافتراضية الرسمية — تُزرع كاملة عند غياب الصف.

export const crmSettingSchemas = {
  // أوزان محرك المخاطر — الافتراضيات الرسمية (P4 يستعملها). الحقول كلها
  // default على مستواها: القيم الجزئية تُكمَّل من الافتراضي.
  risk_weights: z
    .object({
      refusalRate: z.number().min(0).max(100).default(25),
      returnRate: z.number().min(0).max(100).default(20),
      cancellationRate: z.number().min(0).max(100).default(15),
      noAnswerRate: z.number().min(0).max(100).default(10),
      duplicateOrders: z.number().min(0).max(100).default(20),
      addressInconsistency: z.number().min(0).max(100).default(10),
    })
    .prefault({}),
  // عتبات مستويات المخاطر (من 100)
  risk_thresholds: z
    .object({
      medium: z.number().min(1).max(99).default(30),
      high: z.number().min(1).max(99).default(55),
      very_high: z.number().min(1).max(100).default(75),
    })
    .prefault({}),
  // عتبات التجزئة — VIP مثال المواصفة: عدد طلبات + نسبة تسليم + إيراد
  segmentation_thresholds: z
    .object({
      vip_min_orders: z.number().int().min(1).default(3),
      vip_min_delivery_rate_percent: z.number().min(0).max(100).default(80),
      vip_min_revenue_dzd: z.number().int().min(0).default(30000),
      loyal_min_orders: z.number().int().min(1).default(2),
      inactive_days: z.number().int().min(30).default(90),
      profitable_min_margin_percent: z.number().min(0).max(100).default(15),
    })
    .prefault({}),
  // SLA لكل نوع مهمة (بالدقائق) — يقود ترتيب قائمة التأكيد والمتأخرات
  task_sla_minutes: z
    .object({
      confirm_order: z.number().int().min(5).default(120),
      prepare_order: z.number().int().min(5).default(240),
      follow_up: z.number().int().min(5).default(1440),
      manual_review: z.number().int().min(5).default(480),
      logistics_review: z.number().int().min(5).default(480),
      customer_support: z.number().int().min(5).default(480),
    })
    .prefault({}),
  // تكلفة التغليف الافتراضية للطلب الجديد (لقطة وقت الإنشاء)
  packaging_cost_dzd: z.number().int().min(0).default(0),
  // نافذة العزو last-touch بالأيام
  attribution_window_days: z.number().int().min(1).max(365).default(30),
  // حدود التصدير
  export_max_rows: z.number().int().min(100).max(100000).default(10000),
  // تشغيل/تعطيل الأتمتة لكل معالِج (P7)
  automation_enabled: z.record(z.string(), z.boolean()).prefault({}),
} as const;

export type CrmSettingKey = keyof typeof crmSettingSchemas;

export const CRM_SETTING_KEYS = Object.keys(crmSettingSchemas) as CrmSettingKey[];

export function isCrmSettingKey(key: string): key is CrmSettingKey {
  return key in crmSettingSchemas;
}

/** يتحقق من قيمة إعداد ويُرجع النسخة المطابقة (مع defaults من الـschema). */
export function parseCrmSettingValue<K extends CrmSettingKey>(
  key: K,
  value: unknown,
): z.infer<(typeof crmSettingSchemas)[K]> {
  return crmSettingSchemas[key].parse(value) as z.infer<(typeof crmSettingSchemas)[K]>;
}
