import { prisma } from "@/server/db/prisma";
import { writeAuditInTx } from "@/server/services/auditService";
import { executeIdempotent } from "@/server/modules/idempotency/durableIdempotency";
import type { AdjustmentDirection, FinancialAdjustmentType, Prisma } from "@prisma/client";

// التعديلات المالية (P6) — سجلات غير قابلة للتغيير: لا update ولا delete إطلاقًا.
// التصحيح = تعديل تعويضي جديد يشير إلى الأصل (correctionOfId). credit يزيد الربح،
// debit ينقصه. المبالغ أعداد صحيحة دج ≥ 0 (CHECK في القاعدة). كل كتابة موثّقة.
// طلبات isTest لا تقبل تعديلات (لا أثر مالي إنتاجي لها أصلًا).

export type AdjustmentErrorCode =
  | "ORDER_NOT_FOUND"
  | "TEST_ORDER"
  | "INVALID_AMOUNT"
  | "REASON_REQUIRED"
  | "ORIGINAL_NOT_FOUND"
  | "ORIGINAL_ORDER_MISMATCH";

export class AdjustmentError extends Error {
  constructor(
    readonly code: AdjustmentErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AdjustmentError";
  }
}

export const ADJUSTMENT_ERROR_STATUS: Record<AdjustmentErrorCode, number> = {
  ORDER_NOT_FOUND: 404,
  ORIGINAL_NOT_FOUND: 404,
  TEST_ORDER: 409,
  ORIGINAL_ORDER_MISMATCH: 409,
  INVALID_AMOUNT: 400,
  REASON_REQUIRED: 400,
};

export type CreateAdjustmentInput = {
  orderId: string;
  type: FinancialAdjustmentType;
  amountDzd: number;
  direction: AdjustmentDirection;
  reason: string;
  /** التعديل الأصلي الذي يُصحَّح — يُنشأ تعديل تعويضي جديد ولا يُمسّ الأصل */
  correctionOfId?: string | null;
  /** مفتاح idempotency من العميل: إعادة إرسال نفس الطلب تُرجع السجل الأصلي بلا تكرار مالي */
  idempotencyKey?: string | null;
  actor: { type: "admin" | "system" | "api"; id?: string | null };
  correlationId?: string | null;
};

export async function createFinancialAdjustment(input: CreateAdjustmentInput) {
  if (!input.idempotencyKey || !input.actor.id) return createAdjustmentOnce(input);
  // يُخزَّن المعرّف فقط في idempotency_keys؛ السجل نفسه يُقرأ من جدوله عند الإعادة
  const result = await executeIdempotent<{ id: string }>(
    {
      actorId: input.actor.id,
      operation: "financial_adjustment.create",
      idempotencyKey: input.idempotencyKey,
      payload: {
        orderId: input.orderId,
        type: input.type,
        amountDzd: input.amountDzd,
        direction: input.direction,
        reason: input.reason.trim(),
        correctionOfId: input.correctionOfId ?? null,
      },
      deserialize: (json) => ({ id: (json as { id: string }).id }),
    },
    async () => ({ id: (await createAdjustmentOnce(input)).id }),
  );
  return prisma.financialAdjustment.findUniqueOrThrow({ where: { id: result.value.id } });
}

async function createAdjustmentOnce(input: CreateAdjustmentInput) {
  if (!Number.isInteger(input.amountDzd) || input.amountDzd < 0) {
    throw new AdjustmentError("INVALID_AMOUNT", "المبلغ يجب أن يكون عددًا صحيحًا دج ≥ 0");
  }
  const reason = input.reason.trim();
  if (!reason) throw new AdjustmentError("REASON_REQUIRED", "سبب التعديل المالي إلزامي");

  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: input.orderId },
      select: { id: true, isTest: true, customerId: true, orderNumber: true },
    });
    if (!order) throw new AdjustmentError("ORDER_NOT_FOUND", "الطلب غير موجود");
    if (order.isTest) throw new AdjustmentError("TEST_ORDER", "لا تعديلات مالية على طلب اختبار");

    if (input.correctionOfId) {
      const original = await tx.financialAdjustment.findUnique({
        where: { id: input.correctionOfId },
        select: { id: true, orderId: true },
      });
      if (!original) throw new AdjustmentError("ORIGINAL_NOT_FOUND", "التعديل الأصلي غير موجود");
      if (original.orderId !== order.id) {
        throw new AdjustmentError("ORIGINAL_ORDER_MISMATCH", "التعديل الأصلي يخص طلبًا آخر");
      }
    }

    const created = await tx.financialAdjustment.create({
      data: {
        orderId: order.id,
        customerId: order.customerId,
        type: input.type,
        amountDzd: input.amountDzd,
        direction: input.direction,
        reason,
        correctionOfId: input.correctionOfId ?? null,
        createdById: input.actor.type === "admin" ? (input.actor.id ?? null) : null,
      },
    });
    await writeAuditInTx(tx, {
      actorType: input.actor.type,
      actorId: input.actor.id ?? null,
      action: "financial_adjustment_create",
      entityType: "financial_adjustment",
      entityId: created.id,
      after: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        type: created.type,
        amountDzd: created.amountDzd,
        direction: created.direction,
        correctionOfId: created.correctionOfId,
      },
      reason,
      correlationId: input.correlationId ?? null,
    });
    return created;
  });
}

export async function listFinancialAdjustments(params: { orderId?: string; page: number; pageSize: number }) {
  const pageSize = Math.min(Math.max(1, params.pageSize), 100);
  const where: Prisma.FinancialAdjustmentWhereInput = {
    ...(params.orderId ? { orderId: params.orderId } : {}),
    order: { isTest: false },
  };
  const [items, total] = await Promise.all([
    prisma.financialAdjustment.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (Math.max(1, params.page) - 1) * pageSize,
      take: pageSize,
      include: {
        order: { select: { id: true, orderNumber: true } },
        createdBy: { select: { fullName: true, email: true } },
        corrections: { select: { id: true } },
      },
    }),
    prisma.financialAdjustment.count({ where }),
  ]);
  return { items, total, pageSize };
}
