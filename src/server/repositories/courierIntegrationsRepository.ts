import { prisma } from "@/server/db/prisma";
import { encryptSecretIfPresent } from "@/lib/crypto/secretBox";

export function listCourierIntegrations() {
  return prisma.courierIntegration.findMany({ orderBy: { provider: "asc" } });
}

export function findCourierIntegrationByProvider(provider: string) {
  return prisma.courierIntegration.findUnique({ where: { provider } });
}

export type CourierIntegrationUpdate = {
  id: string;
  isEnabled: boolean;
  // undefined = اتركه كما هو، null = امسحه، نص = عيّن قيمة جديدة (تُشفَّر قبل الحفظ).
  apiKey?: string | null;
  apiToken?: string | null;
};

export async function bulkUpdateCourierIntegrations(updates: CourierIntegrationUpdate[]) {
  await prisma.$transaction(
    updates.map((u) =>
      prisma.courierIntegration.update({
        where: { id: u.id },
        data: {
          isEnabled: u.isEnabled,
          ...(u.apiKey !== undefined ? { apiKey: encryptSecretIfPresent(u.apiKey) } : {}),
          ...(u.apiToken !== undefined ? { apiToken: encryptSecretIfPresent(u.apiToken) } : {}),
        },
      }),
    ),
  );
}
