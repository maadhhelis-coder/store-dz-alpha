-- CreateTable
CREATE TABLE "offers" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "trigger_product_id" TEXT NOT NULL,
    "offer_product_id" TEXT NOT NULL,
    "offer_price_dzd" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "offers_trigger_product_id_is_active_idx" ON "offers"("trigger_product_id", "is_active");

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_trigger_product_id_fkey" FOREIGN KEY ("trigger_product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_offer_product_id_fkey" FOREIGN KEY ("offer_product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
