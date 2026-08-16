import { prisma } from "@/server/db/prisma";

export function findWilayaByCode(code: number) {
  return prisma.wilaya.findUnique({ where: { code } });
}

export function listActiveWilayas() {
  return prisma.wilaya.findMany({ where: { isActive: true }, orderBy: { code: "asc" } });
}

export function listAllWilayas() {
  return prisma.wilaya.findMany({ orderBy: { code: "asc" } });
}

export type WilayaPricingUpdate = {
  code: number;
  officePriceDzd: number | null;
  homePriceDzd: number;
  isActive: boolean;
};

export async function bulkUpdateWilayaPricing(updates: WilayaPricingUpdate[]) {
  await prisma.$transaction(
    updates.map((u) =>
      prisma.wilaya.update({
        where: { code: u.code },
        data: {
          officePriceDzd: u.officePriceDzd,
          homePriceDzd: u.homePriceDzd,
          isActive: u.isActive,
        },
      }),
    ),
  );
}
