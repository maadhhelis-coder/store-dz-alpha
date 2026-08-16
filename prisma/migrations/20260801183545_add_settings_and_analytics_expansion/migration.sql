-- CreateEnum
CREATE TYPE "FunnelPageType" AS ENUM ('funnel', 'product_page');

-- CreateEnum
CREATE TYPE "WebhookEvent" AS ENUM ('order_created', 'order_status_changed');

-- AlterTable
ALTER TABLE "funnels" ADD COLUMN     "page_type" "FunnelPageType" NOT NULL DEFAULT 'funnel';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "offer_id" TEXT;

-- CreateTable
CREATE TABLE "site_settings" (
    "id" TEXT NOT NULL,
    "logo_url" TEXT,
    "favicon_url" TEXT,
    "announcement_bar_text" TEXT,
    "announcement_bar_enabled" BOOLEAN NOT NULL DEFAULT false,
    "instagram_url" TEXT,
    "facebook_url" TEXT,
    "tiktok_url" TEXT,
    "privacy_policy_text" TEXT,
    "thank_you_message" TEXT,
    "thank_you_page_url" TEXT,
    "store_domain" TEXT,
    "funnels_domain" TEXT,
    "notify_orders" BOOLEAN NOT NULL DEFAULT true,
    "notify_platform_updates" BOOLEAN NOT NULL DEFAULT true,
    "notify_alerts" BOOLEAN NOT NULL DEFAULT true,
    "notify_system" BOOLEAN NOT NULL DEFAULT true,
    "spam_protection_enabled" BOOLEAN NOT NULL DEFAULT true,
    "order_limit_per_device" INTEGER NOT NULL DEFAULT 3,
    "order_limit_per_phone" INTEGER NOT NULL DEFAULT 3,
    "order_limit_per_email" INTEGER NOT NULL DEFAULT 3,
    "order_limit_per_name" INTEGER NOT NULL DEFAULT 5,
    "order_limit_window_min" INTEGER NOT NULL DEFAULT 10,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courier_integrations" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT false,
    "api_key" TEXT,
    "api_token" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courier_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhooks" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "events" "WebhookEvent"[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_status" INTEGER,
    "last_fired_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "page_views" (
    "id" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "page_views_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "courier_integrations_provider_key" ON "courier_integrations"("provider");

-- CreateIndex
CREATE INDEX "page_views_created_at_idx" ON "page_views"("created_at");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
