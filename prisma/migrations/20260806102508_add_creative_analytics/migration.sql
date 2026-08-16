/*
  Warnings:

  - You are about to drop the `ad_creatives` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "TrackingEventType" AS ENUM ('page_view', 'cta_click', 'form_submit');

-- CreateEnum
CREATE TYPE "PageKind" AS ENUM ('product', 'landing');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "creative_name" TEXT,
ADD COLUMN     "platform" "AdPlatform",
ADD COLUMN     "visitor_id" TEXT;

-- DropTable
DROP TABLE "ad_creatives";

-- CreateTable
CREATE TABLE "ad_spend_entries" (
    "id" TEXT NOT NULL,
    "platform" "AdPlatform" NOT NULL,
    "creative_name" TEXT NOT NULL,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "spend_dzd" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_spend_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracking_events" (
    "id" TEXT NOT NULL,
    "event_type" "TrackingEventType" NOT NULL,
    "page_kind" "PageKind" NOT NULL,
    "path" TEXT NOT NULL,
    "product_slug" TEXT,
    "platform" "AdPlatform",
    "creative_name" TEXT,
    "visitor_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tracking_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ad_spend_entries_platform_creative_name_key" ON "ad_spend_entries"("platform", "creative_name");

-- CreateIndex
CREATE INDEX "tracking_events_event_type_page_kind_platform_idx" ON "tracking_events"("event_type", "page_kind", "platform");

-- CreateIndex
CREATE INDEX "tracking_events_product_slug_platform_idx" ON "tracking_events"("product_slug", "platform");

-- CreateIndex
CREATE INDEX "tracking_events_visitor_id_idx" ON "tracking_events"("visitor_id");

-- CreateIndex
CREATE INDEX "orders_platform_creative_name_idx" ON "orders"("platform", "creative_name");
