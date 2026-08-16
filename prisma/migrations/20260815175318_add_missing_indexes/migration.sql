-- DropIndex
DROP INDEX "tracking_events_event_type_page_kind_platform_idx";

-- CreateIndex
CREATE INDEX "api_keys_key_hash_idx" ON "api_keys"("key_hash");

-- CreateIndex
CREATE INDEX "order_items_variant_id_idx" ON "order_items"("variant_id");

-- CreateIndex
CREATE INDEX "page_views_path_idx" ON "page_views"("path");

-- CreateIndex
CREATE INDEX "tracking_events_page_kind_platform_idx" ON "tracking_events"("page_kind", "platform");
