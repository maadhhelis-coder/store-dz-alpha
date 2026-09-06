-- =====================================================================
-- P5 — صلاحية واحدة جديدة: shipments.reship
--
-- ضرورية لأن role_permissions في PostgreSQL هو المرجع النهائي للتفويض
-- (deny-by-default: غير المدرَج = مرفوض)، فإضافتها للكتالوج في الكود وحدها
-- تجعل كل استدعاء يفشل بـ403 حتى لـowner.
--
-- لماذا صلاحية مستقلة ولا تُعاد استعمال shipments.create أو orders.status_change:
-- إعادة الشحن هي الإجراء الوحيد الذي يفتح استثناء returned→confirmed المرفوض
-- لكل مسار آخر في آلة الحالات، وتتطلب سببًا إلزاميًا. دمجها في صلاحية إنشاء
-- الشحنات يمنح كل من يُنشئ شحنة سلطة إعادة فتح طلبات مرتجعة.
--
-- لا جداول ولا أعمدة ولا enums جديدة: shipments/shipment_items/shipment_events
-- وقيودها (بما فيها الفهرس الفريد الجزئي للشحنة النشطة الواحدة، وفهرسا إلغاء
-- تكرار الأحداث) موجودة كلها منذ 20260901120100_crm_foundation.
--
-- التوزيع مطابق حرفيًا لـDEFAULT_ROLE_PERMISSIONS في src/lib/rbac/permissions.ts
-- (اختبار rbacCatalog يفشل عند أي انحراف).
--
-- idempotent بالكامل: ON CONFLICT DO NOTHING.
-- =====================================================================

-- owner: الكتالوج كاملًا
INSERT INTO "role_permissions" ("id", "role", "permission")
VALUES (gen_random_uuid()::text, 'owner', 'shipments.reship')
ON CONFLICT ("role", "permission") DO NOTHING;

-- admin (وstaff القديمة توافقًا): ليست ضمن الصلاحيات المالكوية الخمس
INSERT INTO "role_permissions" ("id", "role", "permission")
SELECT gen_random_uuid()::text, r."role"::"AdminRole", 'shipments.reship'
FROM (VALUES ('admin'), ('staff')) AS r("role")
ON CONFLICT ("role", "permission") DO NOTHING;

-- logistics_agent: صاحب دورة الشحن والإرجاع فعليًا
INSERT INTO "role_permissions" ("id", "role", "permission")
VALUES (gen_random_uuid()::text, 'logistics_agent', 'shipments.reship')
ON CONFLICT ("role", "permission") DO NOTHING;
