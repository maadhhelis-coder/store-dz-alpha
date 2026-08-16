-- AlterTable: أضف العمود كـnullable أولًا (الجدول يحتوي بيانات حالية، لا يمكن NOT NULL مباشرة).
ALTER TABLE "webhooks" ADD COLUMN "secret" TEXT;

-- Backfill: الصف الوحيد الموجود حاليًا (f598f629-1cb7-458f-b860-6eaa4b44d8b5) يُعطى سرًّا
-- عشوائيًا مشفَّرًا حقيقيًا (نفس تنسيق تشفير secretBox.ts: AES-256-GCM، enc:v1:...) وليس قيمة
-- وهمية — تم توليده مرة واحدة يدويًا خارج هذا الملف، والقيمة الخام سُلِّمت لصاحب المتجر لإعادة
-- ضبطها في مستقبِل الـwebhook (store-dz-agent) عند اعتماد التحقق من التوقيع هناك.
UPDATE "webhooks"
SET "secret" = 'enc:v1:FvzN/szQfWqdFy8o4G7rZ5gLGqCJPeicJolunzsch4y8CkQRXH9yn+f3vmIXiigtF8wkEWtlmJhuWVOHLCQEzLYcTXAUW5tndbJkaAt1oUklX4ZrncJmWe0h3D0='
WHERE "secret" IS NULL;

-- الآن كل الصفوف تملك قيمة، يمكن فرض NOT NULL بأمان.
ALTER TABLE "webhooks" ALTER COLUMN "secret" SET NOT NULL;
