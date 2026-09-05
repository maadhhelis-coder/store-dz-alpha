-- =====================================================================
-- CRM Foundation — إضافة كاملة (Expand) بلا أي تعديل هادم:
-- هوية العملاء، سجل حالات الطلب، مركز التأكيد، المهام، الشحنات، الإرجاعات،
-- التسويات المالية، السجل التدقيقي، الـoutbox، الجداول التشغيلية، وRBAC.
-- القاعدة: PostgreSQL مصدر الحقيقة الوحيد؛ ids نصية (uuid من العميل) بنمط
-- المشروع القائم؛ كل FK بسلوك حذف صريح؛ القيود الجزئية (partial uniques)
-- تُنشأ كسلوSQL خام لأن Prisma لا يعبّر عنها — موثّقة في schema.prisma.
-- =====================================================================

-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('active', 'blacklisted', 'archived');
CREATE TYPE "CustomerPhoneType" AS ENUM ('primary', 'alternative');
CREATE TYPE "CustomerMatchSource" AS ENUM ('new_customer', 'primary_phone', 'alternative_phone');
CREATE TYPE "RiskLevel" AS ENUM ('low', 'medium', 'high', 'very_high');
CREATE TYPE "SegmentKind" AS ENUM ('vip', 'new_customer', 'repeat_customer', 'loyal', 'inactive', 'at_risk', 'high_risk', 'high_rto', 'profitable', 'unprofitable');
CREATE TYPE "ActorType" AS ENUM ('admin', 'system', 'api', 'carrier');
CREATE TYPE "ConfirmationOutcome" AS ENUM ('confirmed', 'no_answer', 'call_back', 'wrong_number', 'cancelled', 'duplicate', 'fraud_suspected', 'customer_requested_change');
CREATE TYPE "TaskType" AS ENUM ('confirm_order', 'prepare_order', 'follow_up', 'manual_review', 'logistics_review', 'customer_support');
CREATE TYPE "TaskStatus" AS ENUM ('open', 'in_progress', 'done', 'cancelled');
CREATE TYPE "TaskPriority" AS ENUM ('low', 'normal', 'high', 'urgent');
CREATE TYPE "ShipmentRole" AS ENUM ('primary', 'replacement', 'reship');
CREATE TYPE "ShipmentStatus" AS ENUM ('created', 'handed_over', 'in_transit', 'out_for_delivery', 'return_requested', 'delivered', 'returned', 'cancelled', 'error');
CREATE TYPE "ShippingCostProvenance" AS ENUM ('actual', 'estimated', 'unavailable');
CREATE TYPE "ReturnReason" AS ENUM ('refused', 'unreachable', 'address_issue', 'delivery_failed', 'damaged', 'wrong_product', 'customer_cancelled', 'carrier_return');
CREATE TYPE "ReturnStatus" AS ENUM ('open', 'in_return_transit', 'received', 'inspected', 'partially_restocked', 'restocked', 'closed', 'rejected');
CREATE TYPE "CommunicationChannel" AS ENUM ('whatsapp', 'sms', 'email');
CREATE TYPE "CommunicationStatus" AS ENUM ('queued', 'sending', 'sent', 'delivered', 'failed');
CREATE TYPE "CodSettlementStatus" AS ENUM ('pending', 'matched', 'discrepancy', 'resolved');
CREATE TYPE "AdjustmentDirection" AS ENUM ('credit', 'debit');
CREATE TYPE "FinancialAdjustmentType" AS ENUM ('full_refund', 'partial_refund', 'shipping', 'return', 'other');
CREATE TYPE "FraudSignalStatus" AS ENUM ('open', 'reviewed', 'dismissed');
CREATE TYPE "DomainEventStatus" AS ENUM ('pending', 'processing', 'processed', 'failed');
CREATE TYPE "AutomationRunStatus" AS ENUM ('success', 'failed', 'dead_letter');

-- ترحيل آمن للأدوار (RBAC Migration Safety): staff → admin تحديدًا، بلا فقدان وصول
-- لأي موجود. قيمة staff تبقى في الـenum للقراءة التاريخية لكنها لم تعد تُمنح،
-- وrole_permissions تمنح staff نفس صلاحيات admin احتياطًا لأي صف قديم متبقٍ.
UPDATE "admin_users" SET "role" = 'admin' WHERE "role" = 'staff';

-- CreateTable: customers
-- primary_phone نسخة عرض مؤقتة متزامنة مع customer_phones (المصدر الرسمي للهوية) —
-- إزالتها لاحقًا عبر expand→contract موثّق بعد اكتمال الانتقال.
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "primary_phone" TEXT NOT NULL,
    "status" "CustomerStatus" NOT NULL DEFAULT 'active',
    "wilaya_code" INTEGER,
    "commune" TEXT,
    "address" TEXT,
    "postal_code" TEXT,
    "notes_internal" TEXT,
    "customer_note" TEXT,
    "tags" TEXT[] NOT NULL DEFAULT '{}',
    "risk_score" INTEGER NOT NULL DEFAULT 0,
    "risk_level" "RiskLevel" NOT NULL DEFAULT 'low',
    "risk_factors" JSONB NOT NULL DEFAULT '[]',
    "risk_calculated_at" TIMESTAMP(3),
    "risk_engine_version" TEXT,
    "first_order_at" TIMESTAMP(3),
    "last_order_at" TIMESTAMP(3),
    "first_acquisition" JSONB,
    "latest_acquisition" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "customers_risk_score_check" CHECK ("risk_score" >= 0),
    CONSTRAINT "customers_wilaya_code_fkey" FOREIGN KEY ("wilaya_code") REFERENCES "wilayas"("code") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable: customer_phones (الهوية الرسمية للهاتف — unique عالمي)
CREATE TABLE "customer_phones" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "phone_normalized" TEXT NOT NULL,
    "phone_type" "CustomerPhoneType" NOT NULL DEFAULT 'alternative',
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT 'order',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_phones_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "customer_phones_phone_normalized_check" CHECK ("phone_normalized" ~ '^0[5-7][0-9]{8}$'),
    CONSTRAINT "customer_phones_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "customer_phones_phone_normalized_key" ON "customer_phones"("phone_normalized");
-- هاتف أساسي واحد لكل عميل (قيد جزئي — لا يعبّر عنه Prisma)
CREATE UNIQUE INDEX "customer_phones_one_primary_idx" ON "customer_phones"("customer_id") WHERE "phone_type" = 'primary';
CREATE INDEX "customer_phones_customer_id_idx" ON "customer_phones"("customer_id");

-- CreateTable: customer_merges (مانيفست الدمج غير القابل للتعديل — أساس الـunmerge)
CREATE TABLE "customer_merges" (
    "id" TEXT NOT NULL,
    "survivor_id" TEXT NOT NULL,
    "merged_id" TEXT NOT NULL,
    "id_map" JSONB NOT NULL,
    "performed_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_merges_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "customer_merges_survivor_neq_merged_check" CHECK ("survivor_id" <> "merged_id"),
    CONSTRAINT "customer_merges_survivor_id_fkey" FOREIGN KEY ("survivor_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "customer_merges_merged_id_fkey" FOREIGN KEY ("merged_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "customer_merges_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable: customer_segments (عضوية متعددة؛ أساسي واحد كحد أقصى)
CREATE TABLE "customer_segments" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "segment" "SegmentKind" NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rule_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_segments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "customer_segments_customer_id_segment_key" UNIQUE ("customer_id", "segment"),
    CONSTRAINT "customer_segments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "customer_segments_one_primary_idx" ON "customer_segments"("customer_id") WHERE "is_primary" = true;

-- CreateTable: role_permissions (المصدر الرسمي لخرائط دور→صلاحية)
CREATE TABLE "role_permissions" (
    "id" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL,
    "permission" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "role_permissions_role_permission_key" UNIQUE ("role", "permission")
);

-- AlterTable: orders — أعمدة CRM (كلها اختيارية/بdefaults — توسيع صرف)
ALTER TABLE "orders" ADD COLUMN "customer_id" TEXT;
ALTER TABLE "orders" ADD COLUMN "customer_match_source" "CustomerMatchSource";
ALTER TABLE "orders" ADD COLUMN "matched_phone_id" TEXT;
ALTER TABLE "orders" ADD COLUMN "phone_normalized" TEXT;
ALTER TABLE "orders" ADD COLUMN "is_test" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "orders" ADD COLUMN "assigned_agent_id" TEXT;
ALTER TABLE "orders" ADD COLUMN "priority" TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE "orders" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "orders" ADD COLUMN "cancellation_reason" TEXT;
ALTER TABLE "orders" ADD COLUMN "utm_source" TEXT;
ALTER TABLE "orders" ADD COLUMN "utm_medium" TEXT;
ALTER TABLE "orders" ADD COLUMN "utm_campaign" TEXT;
ALTER TABLE "orders" ADD COLUMN "utm_content" TEXT;
ALTER TABLE "orders" ADD COLUMN "utm_term" TEXT;
ALTER TABLE "orders" ADD COLUMN "landing_path" TEXT;
ALTER TABLE "orders" ADD COLUMN "campaign_id" TEXT;
ALTER TABLE "orders" ADD COLUMN "ad_set_id" TEXT;
ALTER TABLE "orders" ADD COLUMN "ad_id" TEXT;
ALTER TABLE "orders" ADD COLUMN "first_touch_platform" TEXT;
ALTER TABLE "orders" ADD COLUMN "first_touch_utm_source" TEXT;
ALTER TABLE "orders" ADD COLUMN "first_touch_utm_campaign" TEXT;
ALTER TABLE "orders" ADD COLUMN "cod_collected_at" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN "cod_collected_amount_dzd" INTEGER;
ALTER TABLE "orders" ADD COLUMN "packaging_cost_dzd" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN "other_cost_dzd" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN "customer_note" TEXT;

ALTER TABLE "orders" ADD CONSTRAINT "orders_priority_check" CHECK ("priority" IN ('low', 'normal', 'high', 'urgent'));
ALTER TABLE "orders" ADD CONSTRAINT "orders_cod_collected_amount_dzd_check" CHECK ("cod_collected_amount_dzd" IS NULL OR "cod_collected_amount_dzd" >= 0);
ALTER TABLE "orders" ADD CONSTRAINT "orders_packaging_cost_dzd_check" CHECK ("packaging_cost_dzd" >= 0);
ALTER TABLE "orders" ADD CONSTRAINT "orders_other_cost_dzd_check" CHECK ("other_cost_dzd" >= 0);
-- ثابت 68 على مستوى القاعدة (الجزء القابل للتعبير SQL): new_customer بلا هاتف مطابق،
-- وprimary/alternative بلا فارغ؛ والربط يقتضي مصدر مطابقة (والعكس عند غير الاختباري).
ALTER TABLE "orders" ADD CONSTRAINT "orders_match_source_check" CHECK (
    ("customer_match_source" IS NULL AND "matched_phone_id" IS NULL)
    OR ("customer_match_source" = 'new_customer' AND "matched_phone_id" IS NULL AND "customer_id" IS NOT NULL)
    OR ("customer_match_source" IN ('primary_phone', 'alternative_phone') AND "matched_phone_id" IS NOT NULL AND "customer_id" IS NOT NULL)
);
-- عزل بيانات الاختبار على مستوى القاعدة: طلب isTest لا يرتبط بعميل إطلاقًا
ALTER TABLE "orders" ADD CONSTRAINT "orders_is_test_no_customer_check" CHECK ("is_test" = false OR "customer_id" IS NULL);

ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_matched_phone_id_fkey" FOREIGN KEY ("matched_phone_id") REFERENCES "customer_phones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_assigned_agent_id_fkey" FOREIGN KEY ("assigned_agent_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "orders_customer_id_idx" ON "orders"("customer_id");
CREATE INDEX "orders_phone_normalized_idx" ON "orders"("phone_normalized");
CREATE INDEX "orders_assigned_agent_id_idx" ON "orders"("assigned_agent_id");
CREATE INDEX "orders_utm_campaign_idx" ON "orders"("utm_campaign");

-- Backfill مشتروع وحيد مسموح: تطبيع أرقام الهواتف القائمة (لا إنشاء عملاء ولا ربط)
UPDATE "orders" SET "phone_normalized" = sub."normalized" FROM (
    SELECT "id",
        CASE
            WHEN regexp_replace("phone", '\D', '', 'g') ~ '^0[5-7][0-9]{8}$' THEN regexp_replace("phone", '\D', '', 'g')
            WHEN regexp_replace("phone", '\D', '', 'g') ~ '^213[5-7][0-9]{8}$' THEN '0' || substr(regexp_replace("phone", '\D', '', 'g'), 4)
            WHEN regexp_replace("phone", '\D', '', 'g') ~ '^00213[5-7][0-9]{8}$' THEN '0' || substr(regexp_replace("phone", '\D', '', 'g'), 6)
            ELSE NULL
        END AS "normalized"
    FROM "orders"
) AS sub
WHERE sub."id" = "orders"."id";

-- عزل بيانات ما قبل الإطلاق: كل الطلبات الحالية بيانات اختبار (قرار المالك الموثّق) —
-- هذا وسم انتقالي مسموح به، وليس backfill عملاء ولا ربطًا تاريخيًا.
UPDATE "orders" SET "is_test" = true;

-- CreateTable: order_status_history
CREATE TABLE "order_status_history" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "old_status" "OrderStatus",
    "new_status" "OrderStatus" NOT NULL,
    "actor_type" "ActorType" NOT NULL DEFAULT 'system',
    "actor_id" TEXT,
    "reason" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "order_status_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "order_status_history_order_id_created_at_idx" ON "order_status_history"("order_id", "created_at");
CREATE INDEX "order_status_history_new_status_created_at_idx" ON "order_status_history"("new_status", "created_at");

-- CreateTable: confirmation_attempts (نتائج الاتصال — ليست حالات طلب)
CREATE TABLE "confirmation_attempts" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "agent_id" TEXT,
    "outcome" "ConfirmationOutcome" NOT NULL,
    "note" TEXT,
    "next_follow_up_at" TIMESTAMP(3),
    "duration_sec" INTEGER,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "confirmation_attempts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "confirmation_attempts_duration_sec_check" CHECK ("duration_sec" IS NULL OR "duration_sec" >= 0),
    CONSTRAINT "confirmation_attempts_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "confirmation_attempts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "confirmation_attempts_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "confirmation_attempts_order_id_created_at_idx" ON "confirmation_attempts"("order_id", "created_at");
CREATE INDEX "confirmation_attempts_agent_id_created_at_idx" ON "confirmation_attempts"("agent_id", "created_at");
CREATE INDEX "confirmation_attempts_outcome_created_at_idx" ON "confirmation_attempts"("outcome", "created_at");

-- CreateTable: tasks
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "type" "TaskType" NOT NULL,
    "order_id" TEXT,
    "customer_id" TEXT,
    "assignee_id" TEXT,
    "priority" "TaskPriority" NOT NULL DEFAULT 'normal',
    "status" "TaskStatus" NOT NULL DEFAULT 'open',
    "due_at" TIMESTAMP(3),
    "reminder_at" TIMESTAMP(3),
    "sla_minutes" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'automation',
    "payload" JSONB,
    "created_by" TEXT,
    "completed_at" TIMESTAMP(3),
    "completed_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tasks_source_check" CHECK ("source" IN ('automation', 'manual')),
    CONSTRAINT "tasks_sla_minutes_check" CHECK ("sla_minutes" IS NULL OR "sla_minutes" >= 0),
    CONSTRAINT "tasks_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "tasks_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "tasks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "tasks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "tasks_completed_by_fkey" FOREIGN KEY ("completed_by") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "tasks_status_due_at_idx" ON "tasks"("status", "due_at");
CREATE INDEX "tasks_assignee_id_status_idx" ON "tasks"("assignee_id", "status");

-- Unique مركّب على order_items يُمكّن فرض "نفس الطلب" على مستوى القاعدة لعناصر
-- الشحنة والإرجاع (composite FK) — الإضافة آمنة: id وحده PK فالزوج فريد حتمًا.
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_id_key" UNIQUE ("order_id", "id");

-- CreateTable: shipments (طلب 1→N شحنات — بلا UNIQUE على order_id)
CREATE TABLE "shipments" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "role" "ShipmentRole" NOT NULL DEFAULT 'primary',
    "parent_shipment_id" TEXT,
    "provider" TEXT NOT NULL,
    "tracking_number" TEXT,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'created',
    "cod_amount_dzd" INTEGER NOT NULL DEFAULT 0,
    "shipping_cost_dzd" INTEGER,
    "shipping_cost_provenance" "ShippingCostProvenance" NOT NULL DEFAULT 'unavailable',
    "dest_wilaya_code" INTEGER,
    "dest_commune" TEXT,
    "last_synced_at" TIMESTAMP(3),
    "last_error" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shipments_cod_amount_dzd_check" CHECK ("cod_amount_dzd" >= 0),
    CONSTRAINT "shipments_shipping_cost_dzd_check" CHECK ("shipping_cost_dzd" IS NULL OR "shipping_cost_dzd" >= 0),
    CONSTRAINT "shipments_retry_count_check" CHECK ("retry_count" >= 0),
    CONSTRAINT "shipments_parent_not_self_check" CHECK ("parent_shipment_id" IS NULL OR "parent_shipment_id" <> "id"),
    CONSTRAINT "shipments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "shipments_parent_shipment_id_fkey" FOREIGN KEY ("parent_shipment_id") REFERENCES "shipments"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "shipments_dest_wilaya_code_fkey" FOREIGN KEY ("dest_wilaya_code") REFERENCES "wilayas"("code") ON DELETE SET NULL ON UPDATE CASCADE
);
-- زوج فريد يمكّن الـcomposite FK لفرض انتماء الشحنة/عنصر الشحنة/الإرجاع لنفس الطلب
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_order_id_id_key" UNIQUE ("order_id", "id");
CREATE UNIQUE INDEX "shipments_provider_tracking_number_key" ON "shipments"("provider", "tracking_number") WHERE "tracking_number" IS NOT NULL;
-- V1: شحنة نشطة واحدة كحد أقصى لكل طلب (قاعدة عمل V1 موثّقة — قابلة للتراخي لاحقًا
-- لصالح الشحنات المقسّمة دون تغيير علاقة 1→N)
CREATE UNIQUE INDEX "shipments_one_active_per_order_idx" ON "shipments"("order_id") WHERE "status" IN ('created', 'handed_over', 'in_transit', 'out_for_delivery', 'return_requested');
CREATE INDEX "shipments_order_id_idx" ON "shipments"("order_id");
CREATE INDEX "shipments_status_idx" ON "shipments"("status");

-- CreateTable: shipment_items (العلاقة الرسمية شحنة↔سطر طلب — جاهزة للتقسيم مستقبلًا)
CREATE TABLE "shipment_items" (
    "id" TEXT NOT NULL,
    "shipment_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "order_item_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipment_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shipment_items_quantity_check" CHECK ("quantity" > 0),
    CONSTRAINT "shipment_items_order_id_shipment_id_fkey" FOREIGN KEY ("order_id", "shipment_id") REFERENCES "shipments"("order_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "shipment_items_order_id_order_item_id_fkey" FOREIGN KEY ("order_id", "order_item_id") REFERENCES "order_items"("order_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "shipment_items_shipment_id_idx" ON "shipment_items"("shipment_id");
CREATE INDEX "shipment_items_order_item_id_idx" ON "shipment_items"("order_item_id");

-- CreateTable: shipment_events (إزالة تكرار: تفضيل providerEventId ثم contentHash داخل الشحنة)
CREATE TABLE "shipment_events" (
    "id" TEXT NOT NULL,
    "shipment_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "provider_event_id" TEXT,
    "status" "ShipmentStatus",
    "description" TEXT,
    "raw_payload" JSONB,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipment_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shipment_events_shipment_id_content_hash_key" UNIQUE ("shipment_id", "content_hash"),
    CONSTRAINT "shipment_events_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "shipment_events_provider_provider_event_id_key" ON "shipment_events"("provider", "provider_event_id") WHERE "provider_event_id" IS NOT NULL;
CREATE INDEX "shipment_events_shipment_id_occurred_at_idx" ON "shipment_events"("shipment_id", "occurred_at");

-- CreateTable: returns (طلب 1→N دورات إرجاع — cycleNumber وليس unique على order_id)
CREATE TABLE "returns" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "cycle_number" INTEGER NOT NULL,
    "shipment_id" TEXT,
    "return_number" TEXT NOT NULL,
    "reason" "ReturnReason" NOT NULL,
    "status" "ReturnStatus" NOT NULL DEFAULT 'open',
    "outbound_shipping_cost_dzd" INTEGER,
    "return_shipping_cost_dzd" INTEGER,
    "notes" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "returns_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "returns_cycle_number_check" CHECK ("cycle_number" > 0),
    CONSTRAINT "returns_outbound_shipping_cost_dzd_check" CHECK ("outbound_shipping_cost_dzd" IS NULL OR "outbound_shipping_cost_dzd" >= 0),
    CONSTRAINT "returns_return_shipping_cost_dzd_check" CHECK ("return_shipping_cost_dzd" IS NULL OR "return_shipping_cost_dzd" >= 0),
    CONSTRAINT "returns_return_number_key" UNIQUE ("return_number"),
    CONSTRAINT "returns_order_id_cycle_number_key" UNIQUE ("order_id", "cycle_number"),
    CONSTRAINT "returns_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    -- FK مركّب يفرض "شحنة نفس الطلب" على مستوى القاعدة (MATCH SIMPLE: shipment_id=NULL يتخطى الفحص)
    CONSTRAINT "returns_order_id_shipment_id_fkey" FOREIGN KEY ("order_id", "shipment_id") REFERENCES "shipments"("order_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
-- دورة غير منتهية واحدة كحد أقصى لكل طلب
CREATE UNIQUE INDEX "returns_one_active_cycle_per_order_idx" ON "returns"("order_id") WHERE "status" IN ('open', 'in_return_transit', 'received', 'inspected', 'partially_restocked');
CREATE INDEX "returns_status_created_at_idx" ON "returns"("status", "created_at");

-- CreateTable: return_items (restocked_quantity هو المصدر الوحيد لاسترجاع المخزون — لا boolean)
CREATE TABLE "return_items" (
    "id" TEXT NOT NULL,
    "return_id" TEXT NOT NULL,
    "order_item_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" "ReturnReason",
    "condition" TEXT,
    "restocked_quantity" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "return_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "return_items_quantity_check" CHECK ("quantity" > 0),
    CONSTRAINT "return_items_restocked_quantity_check" CHECK ("restocked_quantity" >= 0 AND "restocked_quantity" <= "quantity"),
    CONSTRAINT "return_items_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "returns"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "return_items_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "return_items_return_id_idx" ON "return_items"("return_id");
CREATE INDEX "return_items_order_item_id_idx" ON "return_items"("order_item_id");

-- CreateTable: communications (سجلات تاريخية — الحالة بدلالة تأكيد المزود فقط)
CREATE TABLE "communications" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT,
    "order_id" TEXT,
    "channel" "CommunicationChannel" NOT NULL,
    "provider" TEXT NOT NULL,
    "template" TEXT,
    "variables" JSONB,
    "status" "CommunicationStatus" NOT NULL DEFAULT 'queued',
    "provider_message_id" TEXT,
    "provider_response" JSONB,
    "error" TEXT,
    "retries" INTEGER NOT NULL DEFAULT 0,
    "lease_until" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "communications_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "communications_retries_check" CHECK ("retries" >= 0),
    CONSTRAINT "communications_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "communications_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "communications_customer_id_created_at_idx" ON "communications"("customer_id", "created_at");
CREATE INDEX "communications_order_id_idx" ON "communications"("order_id");
CREATE INDEX "communications_status_idx" ON "communications"("status");

-- CreateTable: fraud_signals (طبقة إشارات منفصلة عن Risk — لا حظر تلقائي)
CREATE TABLE "fraud_signals" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT,
    "order_id" TEXT,
    "signal" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "evidence" JSONB,
    "engine_version" TEXT NOT NULL,
    "status" "FraudSignalStatus" NOT NULL DEFAULT 'open',
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_by" TEXT,
    "review_reason" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fraud_signals_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fraud_signals_severity_check" CHECK ("severity" IN ('low', 'medium', 'high')),
    CONSTRAINT "fraud_signals_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "fraud_signals_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "fraud_signals_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "fraud_signals_status_idx" ON "fraud_signals"("status");
CREATE INDEX "fraud_signals_customer_id_idx" ON "fraud_signals"("customer_id");
CREATE INDEX "fraud_signals_order_id_idx" ON "fraud_signals"("order_id");

-- CreateTable: financial_adjustments (سجلات غير قابلة للتعديل — التصحيح سجل جديد معوّض)
CREATE TABLE "financial_adjustments" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "type" "FinancialAdjustmentType" NOT NULL,
    "amount_dzd" INTEGER NOT NULL,
    "direction" "AdjustmentDirection" NOT NULL,
    "reason" TEXT NOT NULL,
    "correction_of_id" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_adjustments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "financial_adjustments_amount_dzd_check" CHECK ("amount_dzd" >= 0),
    CONSTRAINT "financial_adjustments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "financial_adjustments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "financial_adjustments_correction_of_id_fkey" FOREIGN KEY ("correction_of_id") REFERENCES "financial_adjustments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "financial_adjustments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "financial_adjustments_order_id_idx" ON "financial_adjustments"("order_id");
CREATE INDEX "financial_adjustments_created_at_idx" ON "financial_adjustments"("created_at");

-- CreateTable: cod_settlements + items (التسوية مستقلة عن دورة حياة الطلب تمامًا)
CREATE TABLE "cod_settlements" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "settlement_date" TIMESTAMP(3) NOT NULL,
    "reconciliation_key" TEXT NOT NULL,
    "expected_dzd" INTEGER NOT NULL DEFAULT 0,
    "collected_dzd" INTEGER NOT NULL DEFAULT 0,
    "discrepancy_dzd" INTEGER NOT NULL DEFAULT 0,
    "status" "CodSettlementStatus" NOT NULL DEFAULT 'pending',
    "reason" TEXT,
    "created_by" TEXT,
    "resolved_by" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cod_settlements_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cod_settlements_provider_reconciliation_key_key" UNIQUE ("provider", "reconciliation_key"),
    CONSTRAINT "cod_settlements_expected_dzd_check" CHECK ("expected_dzd" >= 0),
    CONSTRAINT "cod_settlements_collected_dzd_check" CHECK ("collected_dzd" >= 0),
    CONSTRAINT "cod_settlements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "cod_settlements_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "cod_settlements_provider_settlement_date_idx" ON "cod_settlements"("provider", "settlement_date");

CREATE TABLE "cod_settlement_items" (
    "id" TEXT NOT NULL,
    "settlement_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "tracking_number" TEXT,
    "order_number" TEXT,
    "expected_dzd" INTEGER NOT NULL DEFAULT 0,
    "collected_dzd" INTEGER NOT NULL DEFAULT 0,
    "discrepancy_dzd" INTEGER NOT NULL DEFAULT 0,
    "state" TEXT NOT NULL DEFAULT 'pending',
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cod_settlement_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cod_settlement_items_settlement_id_order_id_key" UNIQUE ("settlement_id", "order_id"),
    CONSTRAINT "cod_settlement_items_expected_dzd_check" CHECK ("expected_dzd" >= 0),
    CONSTRAINT "cod_settlement_items_collected_dzd_check" CHECK ("collected_dzd" >= 0),
    CONSTRAINT "cod_settlement_items_state_check" CHECK ("state" IN ('pending', 'matched', 'discrepancy', 'resolved', 'excluded')),
    CONSTRAINT "cod_settlement_items_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "cod_settlements"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "cod_settlement_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "cod_settlement_items_order_id_idx" ON "cod_settlement_items"("order_id");

-- CreateTable: audit_logs (سجل إلحاقي فقط — بلا أي FK لصفوف قابلة للتغيير)
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT,
    "actor_type" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "correlation_id" TEXT,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at" DESC);
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs"("entity_type", "entity_id", "created_at");
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs"("actor_id", "created_at");

-- CreateTable: domain_events (outbox معاملاتي — الحالة صريحة والـlease قابل للاستعادة)
CREATE TABLE "domain_events" (
    "id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "actor_type" TEXT,
    "actor_id" TEXT,
    "causation_id" TEXT,
    "correlation_id" TEXT,
    "automation_depth" INTEGER NOT NULL DEFAULT 0,
    "originating_handler" TEXT,
    "status" "DomainEventStatus" NOT NULL DEFAULT 'pending',
    "processing_started_at" TIMESTAMP(3),
    "processing_lease_until" TIMESTAMP(3),
    "processed_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "domain_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "domain_events_automation_depth_check" CHECK ("automation_depth" >= 0),
    CONSTRAINT "domain_events_causation_id_fkey" FOREIGN KEY ("causation_id") REFERENCES "domain_events"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "domain_events_pending_idx" ON "domain_events"("created_at") WHERE "status" = 'pending';
CREATE INDEX "domain_events_entity_idx" ON "domain_events"("entity_type", "entity_id");

-- CreateTable: automation_runs (بوابة idempotency فريدة event+handler)
CREATE TABLE "automation_runs" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "handler" TEXT NOT NULL,
    "status" "AutomationRunStatus" NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "error" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_runs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "automation_runs_event_id_handler_key" UNIQUE ("event_id", "handler"),
    CONSTRAINT "automation_runs_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "domain_events"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "automation_runs_status_idx" ON "automation_runs"("status");

-- CreateTable: job_runs (سجل تنفيذ الـcron: قفل/مدة/خطأ/آخر نجاح)
CREATE TABLE "job_runs" (
    "id" TEXT NOT NULL,
    "job" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "trigger" TEXT NOT NULL DEFAULT 'cron',
    "duration_ms" INTEGER,
    "error" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "job_runs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "job_runs_status_check" CHECK ("status" IN ('running', 'success', 'failed'))
);
CREATE INDEX "job_runs_job_started_at_idx" ON "job_runs"("job", "started_at" DESC);

-- CreateTable: integration_sync_logs
CREATE TABLE "integration_sync_logs" (
    "id" TEXT NOT NULL,
    "integration" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "stats" JSONB,
    "error" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "integration_sync_logs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "integration_sync_logs_status_check" CHECK ("status" IN ('running', 'success', 'failed'))
);
CREATE INDEX "integration_sync_logs_integration_started_at_idx" ON "integration_sync_logs"("integration", "started_at" DESC);

-- CreateTable: idempotency_keys (PostgreSQL هو المرجع الدائم — Redis مجرد تسريع)
CREATE TABLE "idempotency_keys" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'claimed',
    "result" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "idempotency_keys_actor_id_operation_idempotency_key_key" UNIQUE ("actor_id", "operation", "idempotency_key"),
    CONSTRAINT "idempotency_keys_status_check" CHECK ("status" IN ('claimed', 'completed', 'failed'))
);
CREATE INDEX "idempotency_keys_expires_at_idx" ON "idempotency_keys"("expires_at");

-- CreateTable: crm_settings (إعدادات تشغيلية فقط — الأذونات ليست هنا أبدًا)
CREATE TABLE "crm_settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_settings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "crm_settings_key_key" UNIQUE ("key"),
    CONSTRAINT "crm_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- AlterTable: wilayas — الاسم اللاتيني (بيانات مرجعية تُزرع من static)
ALTER TABLE "wilayas" ADD COLUMN "name_latin" TEXT;

-- CreateTable: communes (بيانات مرجعية منظمة — لا نصوص عشوائية)
CREATE TABLE "communes" (
    "id" TEXT NOT NULL,
    "code" INTEGER NOT NULL,
    "wilaya_code" INTEGER NOT NULL,
    "name_arabic" TEXT NOT NULL,
    "name_latin" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "communes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "communes_code_key" UNIQUE ("code"),
    CONSTRAINT "communes_wilaya_code_fkey" FOREIGN KEY ("wilaya_code") REFERENCES "wilayas"("code") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "communes_wilaya_code_idx" ON "communes"("wilaya_code");

-- CreateTable: carrier_shipping_rates (تسعير لكل ناقل/ولاية/بلدية/خيار — بلا أسعار مكتوبة بالكود)
CREATE TABLE "carrier_shipping_rates" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "wilaya_code" INTEGER NOT NULL,
    "commune_id" TEXT,
    "delivery_option" "DeliveryOption" NOT NULL,
    "price_dzd" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "carrier_shipping_rates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "carrier_shipping_rates_price_dzd_check" CHECK ("price_dzd" >= 0),
    CONSTRAINT "carrier_shipping_rates_wilaya_code_fkey" FOREIGN KEY ("wilaya_code") REFERENCES "wilayas"("code") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "carrier_shipping_rates_commune_id_fkey" FOREIGN KEY ("commune_id") REFERENCES "communes"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- فريدة مزدوجة مدروسة: سعر على مستوى الولاية (commune_id NULL) وسعر على مستوى البلدية
CREATE UNIQUE INDEX "carrier_shipping_rates_wilaya_wide_key" ON "carrier_shipping_rates"("provider", "wilaya_code", "delivery_option") WHERE "commune_id" IS NULL;
CREATE UNIQUE INDEX "carrier_shipping_rates_commune_specific_key" ON "carrier_shipping_rates"("provider", "commune_id", "delivery_option") WHERE "commune_id" IS NOT NULL;
