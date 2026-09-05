import { requireAdmin, UnauthorizedError, ForbiddenError } from "@/lib/auth/requireAdmin";
import { findPermissionsByRole } from "@/server/repositories/rolePermissionsRepository";
import type { AdminUser } from "@prisma/client";
import type { Permission } from "@/lib/rbac/permissions";

export { UnauthorizedError, ForbiddenError };

// requirePermission — الطبقة المركزية للتفويض (deny by default):
// 1. تتحقق من الجلسة عبر requireAdmin (نفس سلسلة Supabase + admin_users الحالية).
// 2. تقرأ صلاحيات الدور من role_permissions (المرجع النهائي في PostgreSQL).
// 3. غير المدرَج = مرفوض بـ403 — لا ad-hoc role checks فأي route إطلاقًا.
//
// ملاحظة owner: لا bypass هنا — owner يملك الكتالوج كاملًا عبر الـseed نفسه،
// فالتحقق موحّد للجميع. حتى owner لا يتجاوز الـaudit أو قيود القاعدة (معماري).
//
// الاستدعاء المكلف بجلسة API-key يستعمل requireAdminOrApiKey القائم بنفسه —
// الـscopes تُعرَّض على نفس الكتالوج (src/lib/apiKeyScopes.ts تحوّلت لتطابق أسماء
// الصلاحيات حيث تتقاطع).

export async function requirePermission(permission: Permission): Promise<AdminUser> {
  const adminUser = await requireAdmin();
  const granted = await findPermissionsByRole(adminUser.role);
  if (!granted.includes(permission)) {
    throw new ForbiddenError("ليست لديك صلاحية تنفيذ هذا الإجراء");
  }
  return adminUser;
}

/** تحقق من عدة صلاحيات معًا (كلها مطلوبة). */
export async function requireAllPermissions(permissions: Permission[]): Promise<AdminUser> {
  const adminUser = await requireAdmin();
  const granted = new Set(await findPermissionsByRole(adminUser.role));
  const missing = permissions.filter((p) => !granted.has(p));
  if (missing.length > 0) {
    throw new ForbiddenError("ليست لديك صلاحية تنفيذ هذا الإجراء");
  }
  return adminUser;
}
