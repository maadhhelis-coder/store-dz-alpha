import type { AdminUser, Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { toCsv, type CsvCell } from "@/lib/csv";
import { maskPhoneForDisplay } from "@/lib/phone";
import type { Permission } from "@/lib/rbac/permissions";
import { findPermissionsByRole } from "@/server/repositories/rolePermissionsRepository";
import { getCrmSetting } from "@/server/modules/settings/crmSettingsService";
import { writeAudit } from "@/server/services/auditService";

// تصدير CSV متزامن ومحدود (P8) — بلا طابور: الحد export_max_rows (crm_settings)
// يُفحص بـcount قبل أي جلب؛ التجاوز = خطأ صريح (413) لا اقتطاع صامت.
// التفويض: exports.create + صلاحية قراءة الكيان (على المسار)؛ هاتف العميل كاملًا فقط
// لمن يملك customers.read وإلا مقنَّع. طلبات isTest مستبعدة. الأموال أعداد صحيحة DZD،
// التواريخ ISO UTC. كل تصدير يُوثَّق (audit action "export") بعدد الصفوف والفلاتر.

export const EXPORT_ENTITIES = {
  orders: "orders.read",
  customers: "customers.read",
  returns: "returns.read",
  settlements: "finance.read",
  audit: "audit.read",
} as const satisfies Record<string, Permission>;

export type ExportEntity = keyof typeof EXPORT_ENTITIES;

export function isExportEntity(value: string): value is ExportEntity {
  return value in EXPORT_ENTITIES;
}

export type ExportFilters = { dateFrom?: Date; dateTo?: Date; status?: string };

export class ExportTooLargeError extends Error {
  constructor(
    public readonly rows: number,
    public readonly limit: number,
  ) {
    super(`النتيجة ${rows} صفًا تتجاوز الحد ${limit} — ضيّق نطاق التاريخ أو الحالة`);
    this.name = "ExportTooLargeError";
  }
}

function dateRange(f: ExportFilters): Prisma.DateTimeFilter | undefined {
  if (!f.dateFrom && !f.dateTo) return undefined;
  return { ...(f.dateFrom ? { gte: f.dateFrom } : {}), ...(f.dateTo ? { lte: f.dateTo } : {}) };
}

type Dataset = { headers: string[]; count: () => Promise<number>; rows: (take: number) => Promise<CsvCell[][]> };

function datasetFor(entity: ExportEntity, f: ExportFilters, fullPhone: boolean): Dataset {
  const phone = (p: string) => (fullPhone ? p : maskPhoneForDisplay(p));
  const createdAt = dateRange(f);
  switch (entity) {
    case "orders": {
      const where: Prisma.OrderWhereInput = {
        isTest: false,
        ...(createdAt ? { createdAt } : {}),
        ...(f.status ? { status: f.status as Prisma.OrderWhereInput["status"] } : {}),
      };
      return {
        headers: ["order_number", "status", "created_at_utc", "customer_name", "phone", "wilaya", "commune", "delivery_option", "items_subtotal_dzd", "discount_dzd", "delivery_price_dzd", "total_dzd", "cod_collected_dzd", "platform", "utm_campaign", "courier_tracking"],
        count: () => prisma.order.count({ where }),
        rows: async (take) =>
          (await prisma.order.findMany({ where, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take })).map((o) => [
            o.orderNumber, o.status, o.createdAt, `${o.customerFirstName} ${o.customerLastName}`.trim(), phone(o.phone), o.wilayaName, o.commune, o.deliveryOption,
            o.itemsSubtotalDzd, o.discountDzd, o.deliveryPriceDzd, o.totalDzd, o.codCollectedAmountDzd, o.platform, o.utmCampaign, o.courierTrackingId,
          ]),
      };
    }
    case "customers": {
      const where: Prisma.CustomerWhereInput = { ...(createdAt ? { createdAt } : {}), ...(f.status ? { status: f.status as Prisma.CustomerWhereInput["status"] } : {}) };
      return {
        headers: ["id", "full_name", "primary_phone", "status", "wilaya_code", "commune", "risk_level", "risk_score", "first_order_at_utc", "last_order_at_utc", "created_at_utc"],
        count: () => prisma.customer.count({ where }),
        rows: async (take) =>
          (await prisma.customer.findMany({ where, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take })).map((c) => [
            c.id, c.fullName, phone(c.primaryPhone), c.status, c.wilayaCode, c.commune, c.riskLevel, c.riskScore, c.firstOrderAt, c.lastOrderAt, c.createdAt,
          ]),
      };
    }
    case "returns": {
      const where: Prisma.ReturnRecordWhereInput = {
        order: { isTest: false },
        ...(createdAt ? { createdAt } : {}),
        ...(f.status ? { status: f.status as Prisma.ReturnRecordWhereInput["status"] } : {}),
      };
      return {
        headers: ["return_number", "order_number", "cycle", "status", "is_exchange", "reason", "return_shipping_cost_dzd", "outbound_shipping_cost_dzd", "created_at_utc", "resolved_at_utc"],
        count: () => prisma.returnRecord.count({ where }),
        rows: async (take) =>
          (await prisma.returnRecord.findMany({ where, include: { order: { select: { orderNumber: true } } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take })).map((r) => [
            r.returnNumber, r.order.orderNumber, r.cycleNumber, r.status, r.isExchange, r.reason, r.returnShippingCostDzd, r.outboundShippingCostDzd, r.createdAt, r.resolvedAt,
          ]),
      };
    }
    case "settlements": {
      const where: Prisma.CodSettlementWhereInput = {
        ...(createdAt ? { settlementDate: createdAt } : {}),
        ...(f.status ? { status: f.status as Prisma.CodSettlementWhereInput["status"] } : {}),
      };
      return {
        headers: ["provider", "settlement_date_utc", "reconciliation_key", "status", "expected_dzd", "collected_dzd", "discrepancy_dzd", "reason", "created_at_utc", "resolved_at_utc"],
        count: () => prisma.codSettlement.count({ where }),
        rows: async (take) =>
          (await prisma.codSettlement.findMany({ where, orderBy: [{ settlementDate: "asc" }, { id: "asc" }], take })).map((s) => [
            s.provider, s.settlementDate, s.reconciliationKey, s.status, s.expectedDzd, s.collectedDzd, s.discrepancyDzd, s.reason, s.createdAt, s.resolvedAt,
          ]),
      };
    }
    case "audit": {
      const where: Prisma.AuditLogWhereInput = { ...(createdAt ? { createdAt } : {}), ...(f.status ? { action: f.status } : {}) };
      return {
        // before/after منقّحان وقت الكتابة (redactForAudit) — يُصدَّران كما خُزّنا
        headers: ["created_at_utc", "actor_type", "actor_id", "action", "entity_type", "entity_id", "reason", "correlation_id", "before_json", "after_json"],
        count: () => prisma.auditLog.count({ where }),
        rows: async (take) =>
          (await prisma.auditLog.findMany({ where, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take })).map((a) => [
            a.createdAt, a.actorType, a.actorId, a.action, a.entityType, a.entityId, a.reason, a.correlationId, JSON.stringify(a.before ?? null), JSON.stringify(a.after ?? null),
          ]),
      };
    }
  }
}

export async function buildExport(params: {
  entity: ExportEntity;
  filters: ExportFilters;
  actor: AdminUser;
  /** للاختبار فقط — الافتراضي من crm_settings.export_max_rows */
  maxRows?: number;
}): Promise<{ csv: string; rows: number; filename: string }> {
  const [limit, granted] = await Promise.all([params.maxRows ?? getCrmSetting("export_max_rows"), findPermissionsByRole(params.actor.role)]);
  const fullPhone = granted.includes("customers.read");
  const dataset = datasetFor(params.entity, params.filters, fullPhone);

  const rows = await dataset.count();
  if (rows > limit) throw new ExportTooLargeError(rows, limit);
  // take = limit + 1 حارس ثانٍ: لو زاد العدد بين count والجلب لا نُسلّم ملفًا ناقصًا بصمت
  const data = await dataset.rows(limit + 1);
  if (data.length > limit) throw new ExportTooLargeError(data.length, limit);

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  await writeAudit({
    actorType: "admin",
    actorId: params.actor.id,
    action: "export",
    entityType: params.entity,
    after: { rows: data.length, filters: { dateFrom: params.filters.dateFrom ?? null, dateTo: params.filters.dateTo ?? null, status: params.filters.status ?? null }, fullPhone },
  });
  return { csv: toCsv(dataset.headers, data), rows: data.length, filename: `storedz-${params.entity}-${stamp}.csv` };
}
