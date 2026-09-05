// كتالوج صلاحيات RBAC — المصدر الرسمي في الكود. يجب أن يطابق حرفيًا قائمة
// الـseed في migration 20260901120110_crm_role_permissions_seed (اختبار unit
// rbacCatalog يتحقق من التطابق). الجدول role_permissions في PostgreSQL هو
// المرجع النهائي للتفويض (deny by default: غير المدرَج = مرفوض).
// ملاحظة: crm_settings لا يحتوي صلاحيات أبدًا — إعدادات تشغيلية فقط.

import type { AdminRole } from "@prisma/client";

/** كل الصلاحيات المعروفة (resource.action). */
export const PERMISSION_CATALOG = [
  "orders.read",
  "orders.update",
  "orders.status_change",
  "orders.confirm",
  "orders.cancel",
  "orders.assign",
  "customers.read",
  "customers.update",
  "customers.merge",
  "customers.blacklist",
  "customers.anonymize",
  "shipments.read",
  "shipments.create",
  "shipments.update",
  "returns.read",
  "returns.manage",
  "inventory.read",
  "inventory.adjust",
  "finance.read",
  "finance.adjust",
  "finance.reconcile",
  "marketing.read",
  "products.read",
  "products.manage",
  "users.read",
  "users.manage",
  "settings.read",
  "settings.manage",
  "audit.read",
  "exports.create",
  "integrations.read",
  "integrations.manage",
  "tasks.read",
  "tasks.manage",
  "communications.read",
  "communications.send",
  "analytics.read",
  "is_test.manage",
  "risk.read",
  "fraud.review",
] as const;

export type Permission = (typeof PERMISSION_CATALOG)[number];

/** الصلاحيات الحساسة المالكوية — لا تُمنح لأي دور غير owner في الخريطة الافتراضية. */
export const OWNER_ONLY_PERMISSIONS: readonly Permission[] = [
  "users.manage",
  "settings.manage",
  "integrations.manage",
  "is_test.manage",
  "customers.anonymize",
];

export const CRM_ROLES = [
  "owner",
  "admin",
  "confirmation_agent",
  "customer_support",
  "packing_agent",
  "logistics_agent",
  "marketing",
  "accountant",
  "viewer",
] as const;

export type CrmRole = (typeof CRM_ROLES)[number];

/** الخريطة الافتراضية الحتمية (تطابق الـseed حرفيًا) — تستعمل في الاختبارات
 * وفي bootstrap الجداول؛ التفويض الفعلي يقرأ role_permissions من القاعدة. */
export const DEFAULT_ROLE_PERMISSIONS: Record<AdminRole, readonly Permission[]> = {
  owner: PERMISSION_CATALOG,
  admin: PERMISSION_CATALOG.filter((p) => !(OWNER_ONLY_PERMISSIONS as readonly string[]).includes(p)),
  // قيمة قديمة قابلة للقراءة فقط — صلاحياتها = admin احتياطًا لأي صف متبقٍ
  staff: PERMISSION_CATALOG.filter((p) => !(OWNER_ONLY_PERMISSIONS as readonly string[]).includes(p)),
  confirmation_agent: [
    "risk.read",
    "orders.read",
    "orders.update",
    "orders.status_change",
    "orders.confirm",
    "orders.cancel",
    "orders.assign",
    "customers.read",
    "tasks.read",
    "tasks.manage",
    "communications.read",
  ],
  customer_support: [
    "risk.read",
    "fraud.review",
    "orders.read",
    "orders.update",
    "orders.assign",
    "customers.read",
    "customers.update",
    "shipments.read",
    "returns.read",
    "tasks.read",
    "tasks.manage",
    "communications.read",
    "communications.send",
  ],
  packing_agent: ["orders.read", "products.read", "inventory.read", "tasks.read", "tasks.manage"],
  logistics_agent: [
    "orders.read",
    "orders.assign",
    "shipments.read",
    "shipments.create",
    "shipments.update",
    "returns.read",
    "returns.manage",
    "tasks.read",
    "tasks.manage",
  ],
  marketing: ["orders.read", "marketing.read", "analytics.read", "exports.create"],
  accountant: [
    "risk.read",
    "orders.read",
    "customers.read",
    "finance.read",
    "finance.adjust",
    "finance.reconcile",
    "returns.read",
    "analytics.read",
    "exports.create",
    "audit.read",
  ],
  viewer: [
    "risk.read",
    "orders.read",
    "customers.read",
    "shipments.read",
    "returns.read",
    "inventory.read",
    "finance.read",
    "marketing.read",
    "products.read",
    "users.read",
    "settings.read",
    "integrations.read",
    "tasks.read",
    "communications.read",
    "analytics.read",
  ],
};

/** تسميات عربية للأدوار — لواجهة الإدارة (P8). */
export const ROLE_LABELS_AR: Record<CrmRole, string> = {
  owner: "المالك",
  admin: "مدير",
  confirmation_agent: "مؤكِّد طلبات",
  customer_support: "خدمة العملاء",
  packing_agent: "تغليف وتحضير",
  logistics_agent: "لوجستيك",
  marketing: "تسويق",
  accountant: "محاسب",
  viewer: "مشاهدة فقط",
};

export function isKnownPermission(permission: string): permission is Permission {
  return (PERMISSION_CATALOG as readonly string[]).includes(permission);
}
