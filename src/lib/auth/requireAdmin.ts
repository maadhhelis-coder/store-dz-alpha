import { createSupabaseServerClient } from "@/lib/auth/supabaseServerClient";
import { findAdminByAuthUserId } from "@/server/repositories/adminUsersRepository";
import type { AdminUser } from "@prisma/client";

export class UnauthorizedError extends Error {
  constructor(message = "غير مصرح لك بالدخول") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "هذا الإجراء متاح فقط لمالك المتجر") {
    super(message);
    this.name = "ForbiddenError";
  }
}

// يتحقق من جلسة Supabase الحالية، ثم يتأكد أن المستخدم موجود ونشط في admin_users.
// استعملها فبداية كل route handler إداري (دفاع إضافي فوق الـ middleware).
export async function requireAdmin(): Promise<AdminUser> {
  // فشل بناء عميل Supabase أو استدعاء auth.getUser() (رابط/مفتاح فارغ أو غير صالح، أو
  // انقطاع خدمة Supabase Auth) يُعامَل كـ"غير مصرح" (401) لا كخطأ خادم 500 — هذه الطبقة
  // دفاع إضافي مستقل عن middleware.ts، فيجب أن تفشل مغلقة (fail closed) بنفس المبدأ.
  let user;
  try {
    const supabase = await createSupabaseServerClient();
    const result = await supabase.auth.getUser();
    user = result.data.user;
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "auth_check_failed",
        layer: "requireAdmin",
        message: "Supabase auth client failed — treating request as unauthenticated",
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      }),
    );
    throw new UnauthorizedError();
  }

  if (!user) {
    throw new UnauthorizedError();
  }

  const adminUser = await findAdminByAuthUserId(user.id);

  if (!adminUser || !adminUser.isActive) {
    throw new UnauthorizedError();
  }

  return adminUser;
}

// طبقة أشد صرامة فوق requireAdmin — تُستعمل فالإجراءات الحساسة (مفاتيح API، الويبهوكس،
// الإعدادات العامة، الحذف) التي لا ينبغي أن يصل إليها حساب "staff" مساعد، فقط "owner".
export async function requireOwner(): Promise<AdminUser> {
  const adminUser = await requireAdmin();
  if (adminUser.role !== "owner") {
    throw new ForbiddenError();
  }
  return adminUser;
}
