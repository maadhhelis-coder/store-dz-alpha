import { getSiteSettings } from "@/server/services/siteSettingsService";
import { upsertSyncedAdSpend } from "@/server/repositories/adSpendRepository";
import { prisma } from "@/server/db/prisma";
import { decryptSecret } from "@/lib/crypto/secretBox";

export type AdsSyncResult = {
  meta: { synced: number; error: string | null };
  tiktok: { synced: number; error: string | null };
};

// نافذة زمنية متدحرجة (آخر 30 يوم) — تُعاد كتابتها كل مزامنة، فتبقى أرقام المصروف/النقرات
// معبّرة عن الأداء الحديث بدل تراكم أرقام قديمة بلا نهاية.
const SYNC_WINDOW_DAYS = 30;

function dateRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - SYNC_WINDOW_DAYS);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { since: fmt(start), until: fmt(end) };
}

// يدفع الإدخالات على دفعات متوازية (بدل استدعاء تسلسلي واحدًا تلو الآخر) — حساب إعلاني
// بمئات الكرياتيفات كان يعني مئات رحلات DB متتالية، ما قد يتجاوز حد زمن مسارات Vercel.
const SYNC_BATCH_SIZE = 20;

async function runInBatches<T>(items: T[], batchSize: number, run: (item: T) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    await Promise.all(items.slice(i, i + batchSize).map(run));
  }
}

// يجلب أداء كل إعلان حقيقي من Meta Marketing API (Facebook + Instagram معًا عبر
// breakdowns=publisher_platform) — clicks + spend لكل ad_name، ويحفظها في AdSpendEntry.
async function syncMetaAds(): Promise<{ synced: number; error: string | null }> {
  const settings = await getSiteSettings();
  if (!settings.metaAdAccountId || !settings.metaAdsInsightsAccessToken) {
    return { synced: 0, error: null };
  }

  try {
    const { since, until } = dateRange();
    const accountId = settings.metaAdAccountId.replace(/^act_/, "");
    const params = new URLSearchParams({
      level: "ad",
      fields: "ad_name,spend,clicks",
      breakdowns: "publisher_platform",
      time_range: JSON.stringify({ since, until }),
      access_token: decryptSecret(settings.metaAdsInsightsAccessToken),
      limit: "500",
    });

    const res = await fetch(`https://graph.facebook.com/v21.0/act_${accountId}/insights?${params.toString()}`);
    const data = await res.json();

    if (!res.ok) {
      return { synced: 0, error: data?.error?.message ?? `Meta API error (${res.status})` };
    }

    const rows: { ad_name?: string; spend?: string; clicks?: string; publisher_platform?: string }[] =
      data.data ?? [];

    const validRows = rows.filter(
      (row): row is typeof row & { ad_name: string; publisher_platform: "facebook" | "instagram" } =>
        (row.publisher_platform === "facebook" || row.publisher_platform === "instagram") && !!row.ad_name,
    );

    await runInBatches(validRows, SYNC_BATCH_SIZE, (row) =>
      upsertSyncedAdSpend(
        row.publisher_platform,
        row.ad_name,
        Math.round(Number(row.clicks ?? 0)),
        Math.round(Number(row.spend ?? 0)),
      ).then(() => undefined),
    );

    return { synced: validRows.length, error: null };
  } catch (error) {
    return { synced: 0, error: error instanceof Error ? error.message : "خطأ غير معروف" };
  }
}

// يجلب أداء كل إعلان حقيقي من TikTok Marketing API — clicks + spend لكل ad_name،
// ويحفظها في AdSpendEntry.
async function syncTikTokAds(): Promise<{ synced: number; error: string | null }> {
  const settings = await getSiteSettings();
  if (!settings.tiktokAdvertiserId || !settings.tiktokAdsReportAccessToken) {
    return { synced: 0, error: null };
  }

  try {
    const { since, until } = dateRange();
    const res = await fetch("https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Access-Token": decryptSecret(settings.tiktokAdsReportAccessToken),
      },
      body: JSON.stringify({
        advertiser_id: settings.tiktokAdvertiserId,
        report_type: "BASIC",
        data_level: "AUCTION_AD",
        dimensions: ["ad_id"],
        metrics: ["ad_name", "spend", "clicks"],
        start_date: since,
        end_date: until,
        page: 1,
        page_size: 200,
      }),
    });
    const data = await res.json();

    if (!res.ok || data.code !== 0) {
      return { synced: 0, error: data?.message ?? `TikTok API error (${res.status})` };
    }

    const rows: { metrics?: { ad_name?: string; spend?: string; clicks?: string } }[] = data.data?.list ?? [];

    const validRows = rows.filter((row): row is typeof row & { metrics: { ad_name: string } } => !!row.metrics?.ad_name);

    await runInBatches(validRows, SYNC_BATCH_SIZE, (row) =>
      upsertSyncedAdSpend(
        "tiktok",
        row.metrics.ad_name,
        Math.round(Number(row.metrics?.clicks ?? 0)),
        Math.round(Number(row.metrics?.spend ?? 0)),
      ).then(() => undefined),
    );

    return { synced: validRows.length, error: null };
  } catch (error) {
    return { synced: 0, error: error instanceof Error ? error.message : "خطأ غير معروف" };
  }
}

export async function syncAllAds(): Promise<AdsSyncResult> {
  const [meta, tiktok] = await Promise.all([syncMetaAds(), syncTikTokAds()]);

  const settings = await getSiteSettings();
  await prisma.siteSettings.update({ where: { id: settings.id }, data: { adsLastSyncedAt: new Date() } });

  return { meta, tiktok };
}
