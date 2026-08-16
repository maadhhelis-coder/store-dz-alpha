-- AlterTable
ALTER TABLE "ad_spend_entries" ADD COLUMN     "is_auto_synced" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "site_settings" ADD COLUMN     "ads_last_synced_at" TIMESTAMP(3),
ADD COLUMN     "meta_ad_account_id" TEXT,
ADD COLUMN     "meta_ads_insights_access_token" TEXT,
ADD COLUMN     "tiktok_ads_report_access_token" TEXT,
ADD COLUMN     "tiktok_advertiser_id" TEXT;
