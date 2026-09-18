import { z } from "zod";
import {
  AdjustmentDirection,
  CodSettlementStatus,
  FinancialAdjustmentType,
  ReturnReason,
  ReturnStatus,
} from "@prisma/client";
import { PROFIT_DIMENSIONS } from "@/server/modules/finance/profitability";

// مخططات P6 (المرتجعات/التسويات/التعديلات/الربحية) — حدود النظام فقط؛ قواعد
// العمل في الخدمات. الأموال والكميات أعداد صحيحة حصرًا (لا float يمرّ من هنا).

const dzd = z.number().int().min(0).max(1_000_000_000);
const reason = z.string().trim().min(1).max(500);
const uuid = z.string().uuid();

export const createReturnSchema = z.object({
  orderId: uuid,
  reason: z.enum(ReturnReason),
  isExchange: z.boolean().optional(),
  shipmentId: uuid.nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  outboundShippingCostDzd: dzd.nullable().optional(),
  returnShippingCostDzd: dzd.nullable().optional(),
  items: z
    .array(
      z.object({
        orderItemId: uuid,
        quantity: z.number().int().min(1).max(10_000),
        reason: z.enum(ReturnReason).nullable().optional(),
        condition: z.string().trim().max(200).nullable().optional(),
      }),
    )
    .min(1)
    .max(100),
});

export const returnStatusSchema = z.object({
  status: z.enum(ReturnStatus),
  reason: reason.nullable().optional(),
  outboundShippingCostDzd: dzd.nullable().optional(),
  returnShippingCostDzd: dzd.nullable().optional(),
});

export const restockSchema = z.object({
  items: z
    .array(z.object({ returnItemId: uuid, restockedQuantity: z.number().int().min(0).max(10_000) }))
    .min(1)
    .max(100),
  reason: reason.nullable().optional(),
});

export const returnsListQuerySchema = z.object({
  status: z.enum(ReturnStatus).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const importSettlementSchema = z.object({
  provider: z.string().trim().min(1).max(50),
  settlementDate: z.coerce.date(),
  reference: z.string().trim().max(120).nullable().optional(),
  lines: z
    .array(
      z
        .object({
          trackingNumber: z.string().trim().max(120).nullable().optional(),
          orderNumber: z.string().trim().max(50).nullable().optional(),
          collectedDzd: dzd,
          collectedAt: z.coerce.date().nullable().optional(),
          note: z.string().trim().max(300).nullable().optional(),
        })
        .refine((l) => Boolean(l.trackingNumber?.trim() || l.orderNumber?.trim()), {
          message: "كل سطر يحتاج رقم تتبّع أو رقم طلب",
        }),
    )
    .min(1)
    .max(2000),
});

export const settlementsListQuerySchema = z.object({
  status: z.enum(CodSettlementStatus).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const resolveSettlementItemSchema = z.object({
  itemId: uuid,
  reason,
});

export const createAdjustmentSchema = z.object({
  orderId: uuid,
  type: z.enum(FinancialAdjustmentType),
  amountDzd: dzd,
  direction: z.enum(AdjustmentDirection),
  reason,
  correctionOfId: uuid.nullable().optional(),
  idempotencyKey: z.string().trim().min(8).max(100).nullable().optional(),
});

export const adjustmentsListQuerySchema = z.object({
  orderId: uuid.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const PROFIT_RANGES = ["today", "7d", "30d", "90d", "custom"] as const;

export const profitabilityQuerySchema = z
  .object({
    dimension: z.enum(PROFIT_DIMENSIONS).default("date"),
    range: z.enum(PROFIT_RANGES).default("30d"),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .refine((q) => q.range !== "custom" || (q.from && q.to && q.from <= q.to), {
    message: "الفترة المخصصة تحتاج from ≤ to",
  });

/** حدود الفترة الحتمية (UTC) — "today" = بداية اليوم حتى الآن؛ nd = آخر n يوم كاملة + اليوم. */
export function resolveProfitWindow(q: z.infer<typeof profitabilityQuerySchema>, now = new Date()) {
  if (q.range === "custom") return { from: q.from!, to: q.to! };
  const end = now;
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const days = q.range === "today" ? 0 : q.range === "7d" ? 6 : q.range === "30d" ? 29 : 89;
  return { from: new Date(startOfToday.getTime() - days * 86_400_000), to: end };
}
