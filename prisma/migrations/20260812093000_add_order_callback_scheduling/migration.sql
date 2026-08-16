-- AlterTable
ALTER TABLE "orders" ADD COLUMN "next_call_at" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN "call_attempts" INTEGER NOT NULL DEFAULT 0;
