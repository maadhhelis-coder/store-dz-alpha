import { prisma } from "@/server/db/prisma";
import type { AdminRole } from "@prisma/client";

// قراءة خرائط الأدوار من role_permissions — المرجع النهائي للتفويض.
// deny by default: أي (دور، صلاحية) غير موجود = مرفوض.

export async function findPermissionsByRole(role: AdminRole): Promise<string[]> {
  const rows = await prisma.rolePermission.findMany({
    where: { role },
    select: { permission: true },
  });
  return rows.map((r) => r.permission);
}

export async function listAllRolePermissions(): Promise<{ role: AdminRole; permission: string }[]> {
  return prisma.rolePermission.findMany({ select: { role: true, permission: true } });
}
