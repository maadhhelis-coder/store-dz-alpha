import { requireAdmin, requireOwner, UnauthorizedError, ForbiddenError } from "@/lib/auth/requireAdmin";
import { requirePermission } from "@/lib/auth/requirePermission";
import { verifyApiKey, apiKeyHasScope } from "@/server/services/apiKeysService";
import type { ApiKeyScope } from "@/lib/apiKeyScopes";
import type { Permission } from "@/lib/rbac/permissions";

// مقابلة النطاق ⇄ الصلاحية: النظامان يعبّران عن نفس الإجراء بفاصل مختلف
// (":" للمفاتيح الآلية، "." لكتالوج الأدوار). بلا هذه المقابلة كانت جلسة
// المتصفح تمرّ بـrequireAdmin وحدها — أي أن أي دور مفعّل (viewer مثلًا) يصل
// لمسارات الطلبات والمنتجات. المقابلة هنا تجعل الفحص واحدًا للمسارين.
const SCOPE_TO_PERMISSION: Record<ApiKeyScope, Permission> = {
  "orders:read": "orders.read",
  "orders:write": "orders.status_change",
  "products:read": "products.read",
  "products:write": "products.manage",
  "customers:read": "customers.read",
  "analytics:read": "analytics.read",
  "webhooks:write": "integrations.manage",
};

// يسمح للطلب بالمرور إما بجلسة أدمن (Supabase) أو بمفتاح x-api-key صالح —
// يستعملها الوكيل الذكي الخارجي (store-dz-agent) للوصول الآلي دون جلسة متصفح.
// requiredScope: عند المرور بمفتاح API يجب أن يملك المفتاح هذا النطاق تحديدًا (أو نطاقات
// فارغة = وصول كامل)؛ وعند المرور بجلسة متصفح يُفحص الدور مقابل الصلاحية المقابلة للنطاق
// من الكتالوج (deny-by-default). بلا نطاق مطلوب لا نعرف الصلاحية المقصودة فنكتفي
// بالمصادقة — كل المستدعين الحاليين يمرّرون نطاقًا.
// الفاعل المُرجَع يُمرَّر للخدمات كي يُسجَّل في التدقيق/سجل الحالات باسمه الحقيقي (المشرف أو
// معرّف مفتاح API) — كان يُفقد فيُكتب "system" لكل تغيير حالة من لوحة التحكم (تدقيق نهائي).
export type RequestActor = { type: "admin" | "api"; id: string };

export async function requireAdminOrApiKey(request: Request, requiredScope?: ApiKeyScope): Promise<RequestActor> {
  const apiKey = request.headers.get("x-api-key");

  if (apiKey) {
    const verified = await verifyApiKey(apiKey);
    if (!verified) {
      throw new UnauthorizedError();
    }
    if (requiredScope && !apiKeyHasScope(verified, requiredScope)) {
      throw new ForbiddenError("هذا المفتاح لا يملك صلاحية هذا الإجراء");
    }
    return { type: "api", id: verified.id };
  }

  if (requiredScope) {
    const admin = await requirePermission(SCOPE_TO_PERMISSION[requiredScope]);
    return { type: "admin", id: admin.id };
  }
  const admin = await requireAdmin();
  return { type: "admin", id: admin.id };
}

// نفس المبدأ، لكن مسار جلسة المتصفح يتطلب دور "owner" — يُستعمل فالإجراءات الحساسة
// (مثل تسجيل ويبهوك جديد) التي لا ينبغي أن يصل إليها حساب staff، بينما يبقى مسار
// مفتاح API كما هو (الوكيل الخارجي موثوق أصلًا بحيازته للمفتاح السري).
export async function requireOwnerOrApiKey(request: Request, requiredScope?: ApiKeyScope): Promise<void> {
  const apiKey = request.headers.get("x-api-key");

  if (apiKey) {
    const verified = await verifyApiKey(apiKey);
    if (!verified) {
      throw new UnauthorizedError();
    }
    if (requiredScope && !apiKeyHasScope(verified, requiredScope)) {
      throw new ForbiddenError("هذا المفتاح لا يملك صلاحية هذا الإجراء");
    }
    return;
  }

  await requireOwner();
}
