-- توسيع system_alerts بالمواصفة المعتمدة (Blueprint — System Alerts):
-- خطورة صريحة، كيان مرجعي، حالة دورة حياة (open/acknowledged/resolved)،
-- ومرجعية الفاعل للإقرار/الحل. توسيع صرف (Expand) بلا أي تغيير هادم —
-- resolvedAt القائمة تبقى، وmetadata تظل Json منقّحًا من طبقة الخدمة.
ALTER TABLE "system_alerts" ADD COLUMN "severity" TEXT NOT NULL DEFAULT 'medium';
ALTER TABLE "system_alerts" ADD COLUMN "entity_type" TEXT;
ALTER TABLE "system_alerts" ADD COLUMN "entity_id" TEXT;
ALTER TABLE "system_alerts" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'open';
ALTER TABLE "system_alerts" ADD COLUMN "acknowledged_at" TIMESTAMP(3);
ALTER TABLE "system_alerts" ADD COLUMN "acknowledged_by" TEXT;
ALTER TABLE "system_alerts" ADD COLUMN "resolved_by" TEXT;

ALTER TABLE "system_alerts" ADD CONSTRAINT "system_alerts_severity_check" CHECK ("severity" IN ('low', 'medium', 'high', 'critical'));
ALTER TABLE "system_alerts" ADD CONSTRAINT "system_alerts_status_check" CHECK ("status" IN ('open', 'acknowledged', 'resolved'));

-- الإقرار/الحل موثّقان بفاعل واضح — SET NULL عند حذف المستخدم (السجل يبقى)
ALTER TABLE "system_alerts" ADD CONSTRAINT "system_alerts_acknowledged_by_fkey" FOREIGN KEY ("acknowledged_by") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "system_alerts" ADD CONSTRAINT "system_alerts_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- فهرس الحالة القائم (resolvedAt) يبقى؛ نضيف فهرس الاستعلام الجديد فقط.
-- ملاحظة (تصحيح تصادم 42P07): فهرس system_alerts_type_created_at_idx (ASC)
-- موجود منذ إنشاء الجدول الأصلي ويكفي لاستعلامات type+createdAt — لا يُعاد
-- إنشاؤه هنا (كان يفشل الترحيل كله بـ"relation already exists").
CREATE INDEX "system_alerts_status_created_at_idx" ON "system_alerts"("status", "created_at" DESC);

-- توحيد قديم: التنبيهات المفتوحة تاريخيًا (resolvedAt NULL) تبقى open — الافتراضي
-- صحيح بلا أي UPDATE: الصفوف القديمة بلا resolvedAt = open، وذات resolvedAt تُقرأ
-- محسومة عبر resolvedAt (طبقة الخدمة توحّد العرض).
