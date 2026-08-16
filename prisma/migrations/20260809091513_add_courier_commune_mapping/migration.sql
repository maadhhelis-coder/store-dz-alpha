-- CreateTable
CREATE TABLE "courier_commune_mappings" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "wilaya_code" INTEGER NOT NULL,
    "store_commune" TEXT NOT NULL,
    "courier_commune_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "courier_commune_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "courier_commune_mappings_provider_wilaya_code_store_commune_key" ON "courier_commune_mappings"("provider", "wilaya_code", "store_commune");
