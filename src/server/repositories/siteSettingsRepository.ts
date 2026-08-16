import { prisma } from "@/server/db/prisma";
import type { Prisma } from "@prisma/client";

export async function getSiteSettings() {
  const existing = await prisma.siteSettings.findFirst();
  if (existing) return existing;
  return prisma.siteSettings.create({ data: {} });
}

export async function updateSiteSettings(data: Prisma.SiteSettingsUpdateInput) {
  const existing = await getSiteSettings();
  return prisma.siteSettings.update({ where: { id: existing.id }, data });
}
