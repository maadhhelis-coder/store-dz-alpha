import { prisma } from "@/server/db/prisma";
import { encryptSecretIfPresent } from "@/lib/crypto/secretBox";

export const EMAIL_PROVIDERS = ["gmail", "outlook", "yahoo"] as const;
export type EmailProvider = (typeof EMAIL_PROVIDERS)[number];

export async function listEmailIntegrations() {
  await Promise.all(
    EMAIL_PROVIDERS.map((provider) =>
      prisma.emailIntegration.upsert({
        where: { provider },
        create: { provider },
        update: {},
      }),
    ),
  );
  return prisma.emailIntegration.findMany({ orderBy: { provider: "asc" } });
}

export function findEmailIntegration(provider: EmailProvider) {
  return prisma.emailIntegration.findUnique({ where: { provider } });
}

export function saveEmailIntegrationCredentials(
  provider: EmailProvider,
  clientId: string | null,
  clientSecret: string | null | undefined,
) {
  const encryptedSecret = encryptSecretIfPresent(clientSecret);
  return prisma.emailIntegration.upsert({
    where: { provider },
    create: { provider, clientId, clientSecret: encryptedSecret ?? null },
    update: { clientId, ...(clientSecret !== undefined ? { clientSecret: encryptedSecret } : {}) },
  });
}

export function saveEmailIntegrationTokens(
  provider: EmailProvider,
  data: { connectedEmail: string; accessToken: string; refreshToken: string | null; tokenExpiresAt: Date },
) {
  return prisma.emailIntegration.update({
    where: { provider },
    data: {
      ...data,
      accessToken: encryptSecretIfPresent(data.accessToken),
      refreshToken: encryptSecretIfPresent(data.refreshToken),
      isConnected: true,
    },
  });
}

export function disconnectEmailIntegration(provider: EmailProvider) {
  return prisma.emailIntegration.update({
    where: { provider },
    data: {
      isConnected: false,
      connectedEmail: null,
      accessToken: null,
      refreshToken: null,
      tokenExpiresAt: null,
    },
  });
}
