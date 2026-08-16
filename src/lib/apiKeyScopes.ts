// نطاقات مفاتيح API — كل نطاق يقابل مجموعة إجراءات فعلية يستعملها الوكيل الخارجي
// (store-dz-agent) عبر x-api-key. مصفوفة فارغة على مفتاح = وصول كامل (توافقًا مع
// المفاتيح المُنشأة قبل هذه الميزة، راجع تعليق الحقل فـschema.prisma).
export const API_KEY_SCOPES = ["orders:read", "orders:write", "products:read", "webhooks:write"] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export const API_KEY_SCOPE_LABELS: Record<ApiKeyScope, string> = {
  "orders:read": "قراءة الطلبات",
  "orders:write": "تعديل حالة الطلبات",
  "products:read": "قراءة المنتجات (المخزون)",
  "webhooks:write": "تسجيل Webhooks",
};

export function isApiKeyScope(value: string): value is ApiKeyScope {
  return (API_KEY_SCOPES as readonly string[]).includes(value);
}
