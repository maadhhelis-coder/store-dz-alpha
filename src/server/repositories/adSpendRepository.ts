import { prisma } from "@/server/db/prisma";
import type { Prisma } from "@prisma/client";

export function listAdSpendEntries() {
  return prisma.adSpendEntry.findMany({ orderBy: [{ platform: "asc" }, { createdAt: "desc" }] });
}

export function findAdSpendByPlatformAndCreative(
  platform: "facebook" | "instagram" | "tiktok",
  creativeName: string,
) {
  return prisma.adSpendEntry.findUnique({ where: { platform_creativeName: { platform, creativeName } } });
}

export function createAdSpendEntry(data: Prisma.AdSpendEntryCreateInput) {
  return prisma.adSpendEntry.create({ data });
}

export function updateAdSpendEntry(id: string, data: Prisma.AdSpendEntryUpdateInput) {
  return prisma.adSpendEntry.update({ where: { id }, data });
}

export function deleteAdSpendEntry(id: string) {
  return prisma.adSpendEntry.delete({ where: { id } });
}

// تُستعمل عند المزامنة التلقائية من Meta/TikTok Marketing API — تُنشئ أو تُحدّث إدخال
// المصروف/النقرات لكل (منصة + اسم إعلان) دفعة واحدة، وتُعلّمه isAutoSynced حتى تميّزه
// الواجهة عن الإدخالات اليدوية.
export function upsertSyncedAdSpend(
  platform: "facebook" | "instagram" | "tiktok",
  creativeName: string,
  clicks: number,
  spendDzd: number,
) {
  return prisma.adSpendEntry.upsert({
    where: { platform_creativeName: { platform, creativeName } },
    create: { platform, creativeName, clicks, spendDzd, isAutoSynced: true },
    update: { clicks, spendDzd, isAutoSynced: true },
  });
}
