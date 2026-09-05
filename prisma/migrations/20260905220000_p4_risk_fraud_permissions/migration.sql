-- =====================================================================
-- P4 — صلاحيتان جديدتان: risk.read و fraud.review
--
-- ضرورية لأن role_permissions في PostgreSQL هو المرجع النهائي للتفويض
-- (deny-by-default: غير المدرَج = مرفوض)، فإضافة الصلاحية للكتالوج في الكود
-- وحدها تجعل كل استدعاء يفشل بـ403 حتى لـowner. لا جداول ولا أعمدة جديدة:
-- risk/fraud/job_runs موجودة كلها منذ 20260901120100_crm_foundation.
--
-- التوزيع مطابق حرفيًا لـDEFAULT_ROLE_PERMISSIONS في src/lib/rbac/permissions.ts
-- (اختبار rbacCatalog يفشل عند أي انحراف).
--
-- idempotent بالكامل: ON CONFLICT DO NOTHING — إعادة التشغيل بعد فشل جزئي
-- تتقارب للحالة الصحيحة بلا تكرار صفوف.
-- =====================================================================

-- owner: الكتالوج كاملًا
INSERT INTO "role_permissions" ("id", "role", "permission")
SELECT gen_random_uuid()::text, 'owner', v."permission" FROM (VALUES
  ('risk.read'), ('fraud.review')
) AS v("permission")
ON CONFLICT ("role", "permission") DO NOTHING;

-- admin (وstaff القديمة توافقًا): ليستا ضمن الصلاحيات المالكوية الخمس
INSERT INTO "role_permissions" ("id", "role", "permission")
SELECT gen_random_uuid()::text, r."role"::"AdminRole", v."permission"
FROM (VALUES ('risk.read'), ('fraud.review')) AS v("permission"),
     (VALUES ('admin'), ('staff')) AS r("role")
ON CONFLICT ("role", "permission") DO NOTHING;

-- customer_support: يقرأ المخاطر ويراجع إشارات الاحتيال (قرار بشري)
INSERT INTO "role_permissions" ("id", "role", "permission")
SELECT gen_random_uuid()::text, 'customer_support', v."permission" FROM (VALUES
  ('risk.read'), ('fraud.review')
) AS v("permission")
ON CONFLICT ("role", "permission") DO NOTHING;

-- قراءة المخاطر فقط — لا مراجعة احتيال
INSERT INTO "role_permissions" ("id", "role", "permission")
SELECT gen_random_uuid()::text, r."role"::"AdminRole", 'risk.read'
FROM (VALUES ('confirmation_agent'), ('accountant'), ('viewer')) AS r("role")
ON CONFLICT ("role", "permission") DO NOTHING;
