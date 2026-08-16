import { prisma } from "@/server/db/prisma";

export function findAdminByAuthUserId(authUserId: string) {
  return prisma.adminUser.findUnique({ where: { authUserId } });
}

export function touchLastLogin(adminId: string) {
  return prisma.adminUser.update({
    where: { id: adminId },
    data: { lastLoginAt: new Date() },
  });
}

export function updateAdminFullName(adminId: string, fullName: string) {
  return prisma.adminUser.update({
    where: { id: adminId },
    data: { fullName },
  });
}
