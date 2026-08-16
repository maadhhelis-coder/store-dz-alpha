import { requireAdmin, requireOwner, UnauthorizedError, ForbiddenError } from "@/lib/auth/requireAdmin";
import { verifyApiKey, apiKeyHasScope } from "@/server/services/apiKeysService";
import type { ApiKeyScope } from "@/lib/apiKeyScopes";

// يسمح للطلب بالمرور إما بجلسة أدمن (Supabase) أو بمفتاح x-api-key صالح —
// يستعملها الوكيل الذكي الخارجي (store-dz-agent) للوصول الآلي دون جلسة متصفح.
// requiredScope: عند المرور بمفتاح API، يجب أن يملك المفتاح هذا النطاق تحديدًا (أو نطاقات
// فارغة = وصول كامل). جلسة الأدمن لا تتقيّد بالنطاقات — هذه فقط لتقييد صلاحية الأنظمة الآلية.
export async function requireAdminOrApiKey(request: Request, requiredScope?: ApiKeyScope): Promise<void> {
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

  await requireAdmin();
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
