-- CreateTable
CREATE TABLE "email_integrations" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "is_connected" BOOLEAN NOT NULL DEFAULT false,
    "connected_email" TEXT,
    "client_id" TEXT,
    "client_secret" TEXT,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "token_expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_integrations_provider_key" ON "email_integrations"("provider");
