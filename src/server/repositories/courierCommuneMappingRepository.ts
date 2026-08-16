import { prisma } from "@/server/db/prisma";

export function findCourierCommuneMapping(provider: string, wilayaCode: number, storeCommune: string) {
  return prisma.courierCommuneMapping.findUnique({
    where: { provider_wilayaCode_storeCommune: { provider, wilayaCode, storeCommune } },
  });
}

export function upsertCourierCommuneMapping(
  provider: string,
  wilayaCode: number,
  storeCommune: string,
  courierCommuneName: string,
) {
  return prisma.courierCommuneMapping.upsert({
    where: { provider_wilayaCode_storeCommune: { provider, wilayaCode, storeCommune } },
    create: { provider, wilayaCode, storeCommune, courierCommuneName },
    update: { courierCommuneName },
  });
}
