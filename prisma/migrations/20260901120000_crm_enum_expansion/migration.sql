-- توسيع OrderStatus بحالات دورة حياة CRM الجديدة — معزولة عمدًا في migration مستقلة:
-- PostgreSQL لا يسمح باستعمال قيمة ALTER TYPE ADD VALUE داخل نفس المعاملة التي أضافتها،
-- وPrisma يغلّف كل migration في معاملة واحدة، فأي استخدام لهذه القيم يأتي في migration
-- لاحقة حصرًا (راجع MIGRATIONS.md — نفس النمط المعمول به في توسيعات enums السابقة).
ALTER TYPE "OrderStatus" ADD VALUE 'preparing';
ALTER TYPE "OrderStatus" ADD VALUE 'ready_to_ship';
ALTER TYPE "OrderStatus" ADD VALUE 'in_transit';
ALTER TYPE "OrderStatus" ADD VALUE 'out_for_delivery';
ALTER TYPE "OrderStatus" ADD VALUE 'cod_collected';
ALTER TYPE "OrderStatus" ADD VALUE 'return_to_origin';
ALTER TYPE "OrderStatus" ADD VALUE 'fraud_suspected';

-- توسيع AdminRole بأدوار RBAC الثمانية الجديدة (owner/staff موجودان مسبقًا).
-- staff تبقى قيمة قديمة قابلة للقراءة (توافقًا خلفيًا) لكنها لم تعد تُمنح —
-- الـmigration التالية تحوّل كل صفوف staff الحالية إلى admin (ترحيل آمن بلا فقدان وصول).
ALTER TYPE "AdminRole" ADD VALUE 'admin';
ALTER TYPE "AdminRole" ADD VALUE 'confirmation_agent';
ALTER TYPE "AdminRole" ADD VALUE 'customer_support';
ALTER TYPE "AdminRole" ADD VALUE 'packing_agent';
ALTER TYPE "AdminRole" ADD VALUE 'logistics_agent';
ALTER TYPE "AdminRole" ADD VALUE 'marketing';
ALTER TYPE "AdminRole" ADD VALUE 'accountant';
ALTER TYPE "AdminRole" ADD VALUE 'viewer';
