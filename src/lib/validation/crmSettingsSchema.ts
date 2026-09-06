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
  // عتبات التجزئة — VIP مثال المواصفة: عدد طلبات + نسبة تسليم + إيراد.
  // at_risk_days: نافذة الإنذار قبل الخمول — يجب أن تسبق inactive_days حتمًا
  // (القطاعان متعاقبان لا متداخلان، والتحقق أدناه يرفض أي ضبط يخلطهما).
  // high_rto_*: المرتجع بعد التسليم (returnedOrdersCount ÷ recognizedOrdersCount
  // من metrics/definitions.ts حصرًا) مع حد أدنى للعيّنة يمنع حكمًا من طلب واحد.
  segmentation_thresholds: z
    .object({
      vip_min_orders: z.number().int().min(1).default(3),
      vip_min_delivery_rate_percent: z.number().min(0).max(100).default(80),
      vip_min_revenue_dzd: z.number().int().min(0).default(30000),
      loyal_min_orders: z.number().int().min(1).default(2),
      inactive_days: z.number().int().min(30).default(90),
      profitable_min_margin_percent: z.number().min(0).max(100).default(15),
      at_risk_days: z.number().int().min(1).default(45),
      high_rto_min_delivered_orders: z.number().int().min(1).default(3),
      high_rto_rate_percent: z.number().min(1).max(100).default(30),
    })
    .refine((v) => v.at_risk_days < v.inactive_days, {
      message: "at_risk_days يجب أن تكون أقل من inactive_days (نافذة إنذار تسبق الخمول)",
      path: ["at_risk_days"],
    })
    .prefault({}),
  // عتبات كشف الاحتيال (P4) — أعداد فقط. شدّة كل إشارة تصنيف ثابت بطبيعة
  // القاعدة (لا رقم تشغيلي قابل للضبط)، والقاعدة تقبل low|medium|high حصرًا.
  fraud_thresholds: z
    .object({
      shared_device_min_customers: z.number().int().min(2).default(3),
      shared_ip_min_customers: z.number().int().min(2).default(5),
      repeat_refusal_min_orders: z.number().int().min(1).default(3),
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
  // مطابقة الشحن مع الناقل (P5) — لا عتبة ثابتة داخل الكود.
  // stale_dispatch_minutes: شحنة بقيت بلا رقم تتبّع بعد محاولة إرسال أطول من
  // هذه المدة = تباعد يستحق تنبيهًا (لا إعادة إرسال — مصيرها عند الناقل مجهول).
  shipping_reconciliation: z
    .object({
      lookback_days: z.number().int().min(1).max(90).default(14),
      stale_dispatch_minutes: z.number().int().min(5).default(30),
      max_shipments_per_run: z.number().int().min(1).max(1000).default(200),
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
