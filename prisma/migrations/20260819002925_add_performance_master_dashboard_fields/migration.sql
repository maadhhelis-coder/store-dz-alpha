-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'returned';

-- AlterEnum
ALTER TYPE "TrackingEventType" ADD VALUE 'form_start';

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "unit_cost_dzd" INTEGER;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "cancelled_at" TIMESTAMP(3),
ADD COLUMN     "delivered_at" TIMESTAMP(3),
ADD COLUMN     "returned_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "cost_dzd" INTEGER;

-- CreateTable
CREATE TABLE "web_vital_metrics" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "rating" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "visitor_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "web_vital_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "web_vital_metrics_name_created_at_idx" ON "web_vital_metrics"("name", "created_at");

-- CreateIndex
CREATE INDEX "web_vital_metrics_path_idx" ON "web_vital_metrics"("path");
