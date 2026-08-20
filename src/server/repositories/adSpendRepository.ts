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

export type SyncedAdSpendMetrics = {
  clicks: number;
  spendDzd: number;
  impressions?: number;
  ctrPercent?: number;
  cpcDzd?: number;
  cpmDzd?: number;
  campaignId?: string;
  campaignName?: string;
  adId?: string;
  adSetId?: string;
};

// تُستعمل عند المزامنة التلقائية من Meta/TikTok Marketing API — تُنشئ أو تُحدّث إدخال
// المصروف/النقرات لكل (منصة + اسم إعلان) دفعة واحدة، وتُعلّمه isAutoSynced حتى تميّزه
// الواجهة عن الإدخالات اليدوية. الحقول الإضافية (Impressions، CTR، CPC، CPM، معرّفات
// الحملة/الإعلان/المجموعة الإعلانية) اختيارية — تبقى undefined إن لم تُوفّرها المنصة لأي
// سبب، فيُبقيها Prisma كما هي فالتحديث بدل مسحها بقيمة فارغة.
export function upsertSyncedAdSpend(
  platform: "facebook" | "instagram" | "tiktok",
  creativeName: string,
  metrics: SyncedAdSpendMetrics,
) {
  const { clicks, spendDzd, impressions, ctrPercent, cpcDzd, cpmDzd, campaignId, campaignName, adId, adSetId } =
    metrics;
  return prisma.adSpendEntry.upsert({
    where: { platform_creativeName: { platform, creativeName } },
    create: {
      platform,
      creativeName,
      clicks,
      spendDzd,
      impressions,
      ctrPercent,
      cpcDzd,
      cpmDzd,
      campaignId,
      campaignName,
      adId,
      adSetId,
      isAutoSynced: true,
    },
    update: { clicks, spendDzd, impressions, ctrPercent, cpcDzd, cpmDzd, campaignId, campaignName, adId, adSetId, isAutoSynced: true },
  });
}
