-- =====================================================================
-- Seed: role_permissions — الخريطة الافتراضية الحتمية لـdeny-by-default.
-- الكتالوج الرسمي في src/lib/rbac/permissions.ts يجب أن يطابق قائمة
-- _crm_seed_perms هنا حرفيًا (اختبار unit يتحقق من التطابق).
-- staff ترث صلاحيات admin احتياطًا لأي صف قديم متبقٍ (قبل ترحيل الأدوار).
-- الـmigration idempotent بالكامل: DROP IF EXISTS + ON CONFLICT DO NOTHING —
-- الـpooler يلتزم كل statement منفصلًا فأي إعادة تشغيل بعد فشل جزئي تتقارب
-- للحالة الصحيحة دون تكرار صفوف.
-- =====================================================================
DROP TABLE IF EXISTS "_crm_seed_perms";
CREATE TABLE "_crm_seed_perms" ("permission" TEXT PRIMARY KEY);
INSERT INTO "_crm_seed_perms" ("permission") VALUES
  ('orders.read'), ('orders.update'), ('orders.status_change'), ('orders.confirm'), ('orders.cancel'), ('orders.assign'),
  ('customers.read'), ('customers.update'), ('customers.merge'), ('customers.blacklist'), ('customers.anonymize'),
  ('shipments.read'), ('shipments.create'), ('shipments.update'),
  ('returns.read'), ('returns.manage'),
  ('inventory.read'), ('inventory.adjust'),
  ('finance.read'), ('finance.adjust'), ('finance.reconcile'),
  ('marketing.read'),
  ('products.read'), ('products.manage'),
  ('users.read'), ('users.manage'),
  ('settings.read'), ('settings.manage'),
  ('audit.read'),
  ('exports.create'),
  ('integrations.read'), ('integrations.manage'),
  ('tasks.read'), ('tasks.manage'),
  ('communications.read'), ('communications.send'),
  ('analytics.read'),
  ('is_test.manage');

-- owner: الكتالوج كاملًا (البypass الموثّق محصور به ويخضع دائمًا للـaudit والقيود)
INSERT INTO "role_permissions" ("id", "role", "permission")
SELECT gen_random_uuid()::text, 'owner', "permission" FROM "_crm_seed_perms"
ON CONFLICT ("role", "permission") DO NOTHING;

-- admin (وstaff القديمة توافقًا): كل شيء تشغيلي ما عدا الحساسة المالكوية الخمس
INSERT INTO "role_permissions" ("id", "role", "permission")
SELECT gen_random_uuid()::text, r."role"::"AdminRole", p."permission"
FROM "_crm_seed_perms" p, (VALUES ('admin'), ('staff')) AS r("role")
WHERE p."permission" NOT IN ('users.manage', 'settings.manage', 'integrations.manage', 'is_test.manage', 'customers.anonymize')
ON CONFLICT ("role", "permission") DO NOTHING;

-- confirmation_agent: مركز التأكيد
INSERT INTO "role_permissions" ("id", "role", "permission")
SELECT gen_random_uuid()::text, 'confirmation_agent', v."permission" FROM (VALUES
  ('orders.read'), ('orders.update'), ('orders.status_change'), ('orders.confirm'), ('orders.cancel'), ('orders.assign'),
  ('customers.read'), ('tasks.read'), ('tasks.manage'), ('communications.read')
) AS v("permission")
ON CONFLICT ("role", "permission") DO NOTHING;

-- customer_support: خدمة العملاء
INSERT INTO "role_permissions" ("id", "role", "permission")
SELECT gen_random_uuid()::text, 'customer_support', v."permission" FROM (VALUES
  ('orders.read'), ('orders.update'), ('orders.assign'),
  ('customers.read'), ('customers.update'),
  ('shipments.read'), ('returns.read'),
  ('tasks.read'), ('tasks.manage'),
  ('communications.read'), ('communications.send')
) AS v("permission")
ON CONFLICT ("role", "permission") DO NOTHING;

-- packing_agent: التحضير والتغليف
INSERT INTO "role_permissions" ("id", "role", "permission")
SELECT gen_random_uuid()::text, 'packing_agent', v."permission" FROM (VALUES
  ('orders.read'), ('products.read'), ('inventory.read'), ('tasks.read'), ('tasks.manage')
) AS v("permission")
ON CONFLICT ("role", "permission") DO NOTHING;

-- logistics_agent: اللوجستيك
INSERT INTO "role_permissions" ("id", "role", "permission")
SELECT gen_random_uuid()::text, 'logistics_agent', v."permission" FROM (VALUES
  ('orders.read'), ('orders.assign'),
  ('shipments.read'), ('shipments.create'), ('shipments.update'),
  ('returns.read'), ('returns.manage'),
  ('tasks.read'), ('tasks.manage')
) AS v("permission")
ON CONFLICT ("role", "permission") DO NOTHING;

-- marketing: التسويق
INSERT INTO "role_permissions" ("id", "role", "permission")
SELECT gen_random_uuid()::text, 'marketing', v."permission" FROM (VALUES
  ('orders.read'), ('marketing.read'), ('analytics.read'), ('exports.create')
) AS v("permission")
ON CONFLICT ("role", "permission") DO NOTHING;

-- accountant: المالية
INSERT INTO "role_permissions" ("id", "role", "permission")
SELECT gen_random_uuid()::text, 'accountant', v."permission" FROM (VALUES
  ('orders.read'), ('customers.read'),
  ('finance.read'), ('finance.adjust'), ('finance.reconcile'),
  ('returns.read'), ('analytics.read'), ('exports.create'), ('audit.read')
) AS v("permission")
ON CONFLICT ("role", "permission") DO NOTHING;

-- viewer: قراءة فقط
INSERT INTO "role_permissions" ("id", "role", "permission")
SELECT gen_random_uuid()::text, 'viewer', v."permission" FROM (VALUES
  ('orders.read'), ('customers.read'), ('shipments.read'), ('returns.read'),
  ('inventory.read'), ('finance.read'), ('marketing.read'), ('products.read'),
  ('users.read'), ('settings.read'), ('integrations.read'), ('tasks.read'),
  ('communications.read'), ('analytics.read')
) AS v("permission")
ON CONFLICT ("role", "permission") DO NOTHING;

DROP TABLE "_crm_seed_perms";
