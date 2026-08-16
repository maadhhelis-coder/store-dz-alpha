import { prisma } from "@/server/db/prisma";

export function findActiveKeyByHash(keyHash: string) {
  return prisma.apiKey.findFirst({ where: { keyHash, revokedAt: null } });
}

// نستثني keyHash عمدًا — نفس نمط webhooksRepository.PUBLIC_SELECT: لا داعي لكشف تجزئة
// المفتاح لأي طلب إداري (حتى Staff)، رغم أن SHA-256 + مفتاح 256-بت عشوائي يجعلها غير
// قابلة للعكس عمليًا — دفاع بعمق يطابق كيف تُخفى كل الأسرار الأخرى فهذا المشروع.
export function listApiKeys() {
  return prisma.apiKey.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      label: true,
      scopes: true,
      lastUsedAt: true,
      expiresAt: true,
      revokedAt: true,
      createdAt: true,
    },
  });
}

export function createApiKeyRecord(keyHash: string, label: string, scopes: string[], expiresAt: Date | null) {
  return prisma.apiKey.create({ data: { keyHash, label, scopes, expiresAt } });
}

export function revokeApiKey(id: string) {
  return prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
}

export function touchApiKeyLastUsed(id: string) {
  return prisma.apiKey.update({ where: { id }, data: { lastUsedAt: new Date() } });
}
