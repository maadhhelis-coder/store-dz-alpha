-- =====================================================================
-- P6 — المرتجعات والمالية (COD/التعديلات/الربحية)
--
-- كل جداول P6 وقيودها (returns/return_items/cod_settlements/cod_settlement_items/
-- financial_adjustments + CHECK/UNIQUE/FK) موجودة منذ 20260901120100_crm_foundation.
-- هذا الترحيل يضيف عمودين فقط، إضافيين وغير مدمّرين:
--
-- 1. returns.is_exchange — الاستبدال صريح (لا يُستنتج من الملاحظات ولا من نوع
--    الشحنة)، فلا يُحسب رفضًا/RTO ولا يُدهس كإرجاع عادي.
-- 2. cod_settlements.content_hash — بصمة محتوى الاستيراد: إعادة استيراد نفس
--    التسوية (نفس المفتاح ونفس المحتوى) تُعاد دون أثر؛ نفس المفتاح بمحتوى مختلف
--    تعارض يُرفع (409 + SystemAlert) ولا يُكتب فوق القديم أبدًا.
--
-- لا صلاحيات جديدة: returns.read/manage وinventory.adjust وfinance.read/adjust/
-- reconcile مزروعة كلها منذ 20260901120110.
-- =====================================================================

ALTER TABLE "returns" ADD COLUMN IF NOT EXISTS "is_exchange" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "cod_settlements" ADD COLUMN IF NOT EXISTS "content_hash" TEXT;
