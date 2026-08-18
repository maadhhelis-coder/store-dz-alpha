-- CreateTable
CREATE TABLE "system_alerts" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "system_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "system_alerts_type_created_at_idx" ON "system_alerts"("type", "created_at");

-- CreateIndex
CREATE INDEX "system_alerts_resolved_at_idx" ON "system_alerts"("resolved_at");
