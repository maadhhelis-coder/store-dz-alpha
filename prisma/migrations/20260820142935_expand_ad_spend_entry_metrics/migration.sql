-- AlterTable
ALTER TABLE "ad_spend_entries" ADD COLUMN     "ad_id" TEXT,
ADD COLUMN     "ad_set_id" TEXT,
ADD COLUMN     "campaign_id" TEXT,
ADD COLUMN     "campaign_name" TEXT,
ADD COLUMN     "cpc_dzd" INTEGER,
ADD COLUMN     "cpm_dzd" INTEGER,
ADD COLUMN     "ctr_percent" DOUBLE PRECISION,
ADD COLUMN     "impressions" INTEGER;
