-- =====================================================================
-- P7 — التواصل والأتمتة (إضافي وغير مدمّر)
--
-- 1. CommunicationStatus.cancelled — إلغاء رسالة معلّقة/فاشلة إجراء موثّق.
-- 2. communications.dedupe_key UNIQUE — إلغاء التكرار الدائم للرسائل الآلية
--    (نفس الحدث التجاري = رسالة واحدة مهما تكررت المحاولات). NULL للرسائل اليدوية.
-- 3. صلاحيتان جديدتان: automation.read / automation.retry — مراقبة صندوق
--    الأحداث وإعادة تشغيل الفاشل منه يدويًا (لم يكن لهما مكافئ في الكتالوج).
--    التوزيع مطابق لـDEFAULT_ROLE_PERMISSIONS (اختبار rbacCatalog يحرسه).
-- لا تعديل على لقطات الطلبات ولا backfill.
-- =====================================================================

ALTER TYPE "CommunicationStatus" ADD VALUE IF NOT EXISTS 'cancelled';

ALTER TABLE "communications" ADD COLUMN IF NOT EXISTS "dedupe_key" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "communications_dedupe_key_key" ON "communications"("dedupe_key");

INSERT INTO "role_permissions" ("id", "role", "permission")
SELECT gen_random_uuid()::text, r."role"::"AdminRole", p."permission"
FROM (VALUES ('owner'), ('admin'), ('staff'), ('viewer'), ('accountant')) AS r("role")
CROSS JOIN (VALUES ('automation.read')) AS p("permission")
ON CONFLICT ("role", "permission") DO NOTHING;

INSERT INTO "role_permissions" ("id", "role", "permission")
SELECT gen_random_uuid()::text, r."role"::"AdminRole", 'automation.retry'
FROM (VALUES ('owner'), ('admin'), ('staff')) AS r("role")
ON CONFLICT ("role", "permission") DO NOTHING;
