import { prisma } from "@/server/db/prisma";
import { writeAuditInTx } from "@/server/services/auditService";
import { createOutboxEvent, transitionOrderStatus } from "@/server/modules/orders/statusService";
import { nudgeOutbox } from "@/server/modules/automation/outboxDrainer";
import { isUniqueViolation } from "@/server/modules/shipping/shipmentService";
import { isShippedEligible } from "@/server/modules/metrics/definitions";
import { raiseSystemAlert } from "@/server/modules/alerts/alertsService";
import { Prisma, type OrderStatus, type ReturnReason, type ReturnStatus } from "@prisma/client";

// خدمة المرتجعات (P6) — نقطة الكتابة الوحيدة لدورات الإرجاع والاسترجاع.
//
// - دورات متعددة لكل طلب: cycleNumber يُولَّد داخل معاملة بعد قفل صف الطلب
//   (SELECT ... FOR UPDATE) فلا يتكرر تحت التزامن؛ UNIQUE(order_id, cycle_number)
//   في القاعدة حارس ثانٍ. دورة نشطة واحدة كحد أقصى (فهرس فريد جزئي).
// - إرجاع جزئي: Σ الكميات على الدورات غير المرفوضة لكل بند ≤ كمية البند — تُحسب
//   داخل نفس المعاملة تحت قفل الطلب (لا فحص-ثم-كتابة بلا قفل).
// - الاسترجاع للمخزون حصرًا عبر return_items.restocked_quantity: للفارق فقط،
//   ذري (قفل صف البند + CAS)، idempotent (تكرار نفس الطلب لا يُغيّر شيئًا)،
//   موثّق (audit داخل المعاملة). التناقص مرفوض في المسار العادي.
// - حالة الطلب "returned" لا تُعيد مخزونًا أبدًا (أُزيل السلوك القديم من statusService).
// - الاستبدال صريح (isExchange) — يمرّ بنفس الدورة لكنه لا يُعدّ رفضًا في المقاييس.

export type ReturnErrorCode =
  | "ORDER_NOT_FOUND"
  | "ORDER_NOT_RETURNABLE"
  | "RETURN_NOT_FOUND"
  | "INVALID_ITEMS"
  | "QUANTITY_EXCEEDED"
  | "ACTIVE_CYCLE_EXISTS"
  | "INVALID_RETURN_TRANSITION"
  | "RESTOCK_NOT_ALLOWED"
  | "RESTOCK_DECREASE_FORBIDDEN"
  | "RESTOCK_EXCEEDS_QUANTITY"
  | "RESTOCK_TARGET_MISSING";

export class ReturnError extends Error {
  constructor(
    readonly code: ReturnErrorCode,
    message: string,
    readonly returnId?: string,
  ) {
    super(message);
    this.name = "ReturnError";
  }
}

export const RETURN_ERROR_STATUS: Record<ReturnErrorCode, number> = {
  ORDER_NOT_FOUND: 404,
  RETURN_NOT_FOUND: 404,
  ORDER_NOT_RETURNABLE: 409,
  ACTIVE_CYCLE_EXISTS: 409,
  INVALID_RETURN_TRANSITION: 409,
  RESTOCK_NOT_ALLOWED: 409,
  RESTOCK_DECREASE_FORBIDDEN: 409,
  INVALID_ITEMS: 400,
  QUANTITY_EXCEEDED: 409,
  RESTOCK_EXCEEDS_QUANTITY: 400,
  RESTOCK_TARGET_MISSING: 409,
};

export type ReturnActor = { type: "admin" | "system" | "api" | "carrier"; id?: string | null };

/** الحالات النشطة — تطابق حرفيًا الفهرس الفريد الجزئي returns_one_active_cycle_per_order_idx */
export const ACTIVE_RETURN_STATUSES: readonly ReturnStatus[] = [
  "open",
  "in_return_transit",
  "received",
  "inspected",
  "partially_restocked",
];

/** جدول انتقالات دورة الإرجاع — restocked/partially_restocked تُكتب من الاسترجاع فقط. */
const RETURN_TRANSITIONS: Readonly<Record<ReturnStatus, readonly ReturnStatus[]>> = {
  open: ["in_return_transit", "received", "rejected", "closed"],
  in_return_transit: ["received", "rejected"],
  received: ["inspected", "rejected", "closed"],
  inspected: ["closed", "rejected"],
  partially_restocked: ["closed"],
  restocked: ["closed"],
  closed: [],
  rejected: [],
};

/** الحالات التي يُسمح فيها بالاسترجاع للمخزون — بعد استلام البضاعة فعليًا. restocked مدرجة
 * عمدًا: إعادة إرسال نفس الطلب بعد اكتمال الاسترجاع (retry) يجب أن تكون بلا أثر لا خطأ
 * (الفارق صفر حتمًا لأن restocked = quantity)، وهذا ما أثبته E2E فعليًا (كان 409). */
const RESTOCKABLE_STATUSES: readonly ReturnStatus[] = ["received", "inspected", "partially_restocked", "restocked"];

export type CreateReturnInput = {
  orderId: string;
  reason: ReturnReason;
  isExchange?: boolean;
  shipmentId?: string | null;
  notes?: string | null;
  outboundShippingCostDzd?: number | null;
  returnShippingCostDzd?: number | null;
  items: { orderItemId: string; quantity: number; reason?: ReturnReason | null; condition?: string | null }[];
  actor: ReturnActor;
  correlationId?: string | null;
};

export async function createReturn(input: CreateReturnInput) {
  if (input.items.length === 0) throw new ReturnError("INVALID_ITEMS", "دورة الإرجاع بلا بنود");
  const seen = new Set<string>();
  for (const it of input.items) {
    if (!Number.isInteger(it.quantity) || it.quantity <= 0) {
      throw new ReturnError("INVALID_ITEMS", "كمية الإرجاع يجب أن تكون عددًا صحيحًا موجبًا");
    }
    if (seen.has(it.orderItemId)) throw new ReturnError("INVALID_ITEMS", "بند مكرَّر في نفس الدورة");
    seen.add(it.orderItemId);
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      // قفل صف الطلب: يسلسل كل مُنشئي الدورات لنفس الطلب — رقم الدورة ومجاميع
      // الكميات تُحسب تحت هذا القفل حصرًا.
      const locked = await tx.$queryRaw<{ id: string; order_number: string; status: OrderStatus }[]>`
        SELECT id, order_number, status FROM orders WHERE id = ${input.orderId} FOR UPDATE
      `;
      const order = locked[0];
      if (!order) throw new ReturnError("ORDER_NOT_FOUND", "الطلب غير موجود");
      if (!isShippedEligible(order.status)) {
        throw new ReturnError(
          "ORDER_NOT_RETURNABLE",
          `لا دورة إرجاع لطلب حالته ${order.status} — الإرجاع لما وصل الناقل فعلًا`,
        );
      }

      const orderItems = await tx.orderItem.findMany({
        where: { orderId: input.orderId },
        select: { id: true, quantity: true },
      });
      const byId = new Map(orderItems.map((oi) => [oi.id, oi.quantity]));
      for (const it of input.items) {
        if (!byId.has(it.orderItemId)) throw new ReturnError("INVALID_ITEMS", "بند لا ينتمي لهذا الطلب");
      }
      if (input.shipmentId) {
        const owned = await tx.shipment.count({ where: { id: input.shipmentId, orderId: input.orderId } });
        if (owned === 0) throw new ReturnError("INVALID_ITEMS", "الشحنة لا تخصّ هذا الطلب");
      }

      // Σ المُرجَع سابقًا (دورات غير مرفوضة) لكل بند — تحت قفل الطلب
      const previous = await tx.returnItem.groupBy({
        by: ["orderItemId"],
        where: { returnRecord: { orderId: input.orderId, status: { not: "rejected" } } },
        _sum: { quantity: true },
      });
      const alreadyReturned = new Map(previous.map((p) => [p.orderItemId, p._sum.quantity ?? 0]));
      for (const it of input.items) {
        const cap = byId.get(it.orderItemId)!;
        const total = (alreadyReturned.get(it.orderItemId) ?? 0) + it.quantity;
        if (total > cap) {
          throw new ReturnError(
            "QUANTITY_EXCEEDED",
            `الكمية المُرجَعة (${total}) تتجاوز كمية البند الأصلية (${cap})`,
          );
        }
      }

      const last = await tx.returnRecord.aggregate({
        where: { orderId: input.orderId },
        _max: { cycleNumber: true },
      });
      const cycleNumber = (last._max.cycleNumber ?? 0) + 1;

      const record = await tx.returnRecord.create({
        data: {
          orderId: input.orderId,
          cycleNumber,
          returnNumber: `${order.order_number}-R${cycleNumber}`,
          shipmentId: input.shipmentId ?? null,
          reason: input.reason,
          isExchange: input.isExchange ?? false,
          notes: input.notes ?? null,
          outboundShippingCostDzd: input.outboundShippingCostDzd ?? null,
          returnShippingCostDzd: input.returnShippingCostDzd ?? null,
          items: {
            create: input.items.map((it) => ({
              orderItemId: it.orderItemId,
              quantity: it.quantity,
              reason: it.reason ?? null,
              condition: it.condition ?? null,
            })),
          },
        },
        include: { items: true },
      });

      await writeAuditInTx(tx, {
        actorType: input.actor.type,
        actorId: input.actor.id ?? null,
        action: "return_create",
        entityType: "return",
        entityId: record.id,
        after: {
          orderId: input.orderId,
          returnNumber: record.returnNumber,
          cycleNumber,
          reason: input.reason,
          isExchange: record.isExchange,
          items: record.items.map((i) => ({ orderItemId: i.orderItemId, quantity: i.quantity })),
        },
        reason: input.notes ?? null,
        correlationId: input.correlationId ?? null,
      });
      await createOutboxEvent(tx, {
        eventType: "return.created",
        entityType: "return",
        entityId: record.id,
        payload: {
          orderId: input.orderId,
          returnNumber: record.returnNumber,
          cycleNumber,
          isExchange: record.isExchange,
        },
        actorType: input.actor.type,
        actorId: input.actor.id ?? null,
        correlationId: input.correlationId ?? null,
      });
      return record;
    });
    nudgeOutbox();
    return created;
  } catch (error) {
    if (isUniqueViolation(error)) {
      const active = await prisma.returnRecord.findFirst({
        where: { orderId: input.orderId, status: { in: [...ACTIVE_RETURN_STATUSES] } },
        select: { id: true },
      });
      if (active) {
        throw new ReturnError("ACTIVE_CYCLE_EXISTS", "لهذا الطلب دورة إرجاع نشطة بالفعل", active.id);
      }
    }
    throw error;
  }
}

export type TransitionReturnInput = {
  returnId: string;
  to: ReturnStatus;
  actor: ReturnActor;
  reason?: string | null;
  outboundShippingCostDzd?: number | null;
  returnShippingCostDzd?: number | null;
  correlationId?: string | null;
};

// انتقال حالة الطلب المصاحب لاستلام البضاعة: ما وصل الناقل ثم عاد = returned
// (عبر آلة الحالات نفسها، لا كتابة مباشرة). للاستبدال أيضًا — الشحنة البديلة تُفتح
// بعدها عبر reship (الاستثناء الموثّق returned→confirmed).
const RECEIVED_ORDER_PATH: Partial<Record<OrderStatus, OrderStatus[]>> = {
  shipped: ["return_to_origin", "returned"],
  in_transit: ["return_to_origin", "returned"],
  out_for_delivery: ["return_to_origin", "returned"],
  return_to_origin: ["returned"],
  delivered: ["returned"],
  cod_collected: ["returned"],
};

export async function transitionReturnStatus(input: TransitionReturnInput) {
  const existing = await prisma.returnRecord.findUnique({
    where: { id: input.returnId },
    select: { id: true, status: true, orderId: true, order: { select: { status: true } } },
  });
  if (!existing) throw new ReturnError("RETURN_NOT_FOUND", "دورة الإرجاع غير موجودة");
  if (!RETURN_TRANSITIONS[existing.status].includes(input.to)) {
    throw new ReturnError(
      "INVALID_RETURN_TRANSITION",
      `انتقال دورة إرجاع غير مسموح: ${existing.status} → ${input.to}`,
    );
  }
  const terminal = input.to === "closed" || input.to === "rejected";

  const updated = await prisma.$transaction(async (tx) => {
    // CAS على الحالة الحالية — سباق انتقالين ينتهي بفائز واحد
    const guarded = await tx.returnRecord.updateMany({
      where: { id: input.returnId, status: existing.status },
      data: {
        status: input.to,
        resolvedAt: terminal ? new Date() : null,
        ...(input.outboundShippingCostDzd !== undefined
          ? { outboundShippingCostDzd: input.outboundShippingCostDzd }
          : {}),
        ...(input.returnShippingCostDzd !== undefined
          ? { returnShippingCostDzd: input.returnShippingCostDzd }
          : {}),
      },
    });
    if (guarded.count === 0) {
      throw new ReturnError("INVALID_RETURN_TRANSITION", "تغيّرت حالة الدورة أثناء الطلب — أعد التحميل");
    }
    await writeAuditInTx(tx, {
      actorType: input.actor.type,
      actorId: input.actor.id ?? null,
      action: "return_status_change",
      entityType: "return",
      entityId: input.returnId,
      before: { status: existing.status },
      after: {
        status: input.to,
        outboundShippingCostDzd: input.outboundShippingCostDzd,
        returnShippingCostDzd: input.returnShippingCostDzd,
      },
      reason: input.reason ?? null,
      correlationId: input.correlationId ?? null,
    });
    return tx.returnRecord.findUniqueOrThrow({ where: { id: input.returnId }, include: { items: true } });
  });

  if (input.to === "received") {
    for (const next of RECEIVED_ORDER_PATH[existing.order.status] ?? []) {
      await transitionOrderStatus(existing.orderId, next, {
        actor: input.actor,
        reason: `استلام دورة الإرجاع ${updated.returnNumber}`,
        correlationId: input.correlationId ?? null,
      });
    }
  }
  return updated;
}

export type RestockInput = {
  returnId: string;
  items: { returnItemId: string; restockedQuantity: number }[];
  actor: ReturnActor;
  reason?: string | null;
  correlationId?: string | null;
};

export type RestockResult = {
  returnId: string;
  status: ReturnStatus;
  /** الفوارق المطبَّقة فعلًا — فارغة عند التكرار (idempotent) */
  applied: { returnItemId: string; delta: number; restockedQuantity: number }[];
};

/** الاسترجاع للمخزون — للفارق فقط تحت قفل صف البند؛ تكرار نفس الطلب = لا أثر. */
export async function restockReturnItems(input: RestockInput): Promise<RestockResult> {
  if (input.items.length === 0) throw new ReturnError("INVALID_ITEMS", "لا بنود للاسترجاع");
  const seen = new Set<string>();
  for (const it of input.items) {
    if (!Number.isInteger(it.restockedQuantity) || it.restockedQuantity < 0) {
      throw new ReturnError("INVALID_ITEMS", "كمية الاسترجاع يجب أن تكون عددًا صحيحًا ≥ 0");
    }
    if (seen.has(it.returnItemId)) throw new ReturnError("INVALID_ITEMS", "بند مكرَّر في طلب الاسترجاع");
    seen.add(it.returnItemId);
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const record = await tx.returnRecord.findUnique({
        where: { id: input.returnId },
        select: { id: true, status: true, orderId: true },
      });
      if (!record) throw new ReturnError("RETURN_NOT_FOUND", "دورة الإرجاع غير موجودة");
      if (!RESTOCKABLE_STATUSES.includes(record.status)) {
        throw new ReturnError(
          "RESTOCK_NOT_ALLOWED",
          `لا استرجاع لدورة حالتها ${record.status} — يجب استلام البضاعة أولًا`,
        );
      }

      // قفل صفوف البنود المطلوبة بترتيب ثابت (id) — يسلسل طلبَي استرجاع متزامنَين
      // فيرى الثاني القيمة المحدَّثة ويكون فارقه صفرًا (idempotent بلا خطأ).
      const ids = [...new Set(input.items.map((i) => i.returnItemId))].sort();
      const lockedRows = await tx.$queryRaw<
        { id: string; quantity: number; restocked_quantity: number; order_item_id: string }[]
      >`
        SELECT id, quantity, restocked_quantity, order_item_id
        FROM return_items
        WHERE return_id = ${input.returnId} AND id IN (${Prisma.join(ids)})
        ORDER BY id FOR UPDATE
      `;
      if (lockedRows.length !== ids.length) {
        throw new ReturnError("INVALID_ITEMS", "بند استرجاع لا ينتمي لهذه الدورة");
      }
      const targets = await tx.orderItem.findMany({
        where: { id: { in: lockedRows.map((r) => r.order_item_id) } },
        select: { id: true, productId: true, variantId: true },
      });
      const targetById = new Map(targets.map((t) => [t.id, t]));

      const applied: RestockResult["applied"] = [];
      for (const req of input.items) {
        const row = lockedRows.find((r) => r.id === req.returnItemId)!;
        if (req.restockedQuantity > row.quantity) {
          throw new ReturnError(
            "RESTOCK_EXCEEDS_QUANTITY",
            `الاسترجاع (${req.restockedQuantity}) يتجاوز كمية البند المُرجَعة (${row.quantity})`,
          );
        }
        if (req.restockedQuantity < row.restocked_quantity) {
          throw new ReturnError(
            "RESTOCK_DECREASE_FORBIDDEN",
            "تقليل الكمية المُستَرجَعة ممنوع في هذا المسار — يتطلب تسوية مخزون منفصلة موثّقة",
          );
        }
        const delta = req.restockedQuantity - row.restocked_quantity;
        if (delta === 0) continue;

        const target = targetById.get(row.order_item_id);
        if (!target || (!target.variantId && !target.productId)) {
          throw new ReturnError(
            "RESTOCK_TARGET_MISSING",
            "المنتج الأصلي لهذا البند لم يعد موجودًا — لا هدف للاسترجاع",
          );
        }

        // CAS على القيمة المقروءة تحت القفل — حارس ثانٍ فوق القفل نفسه
        const cas = await tx.returnItem.updateMany({
          where: { id: row.id, restockedQuantity: row.restocked_quantity },
          data: { restockedQuantity: req.restockedQuantity },
        });
        if (cas.count === 0) throw new Error("restock CAS failed under row lock — unexpected");

        if (target.variantId) {
          await tx.productVariant.update({
            where: { id: target.variantId },
            data: { inventoryCount: { increment: delta } },
          });
        } else if (target.productId) {
          await tx.product.update({
            where: { id: target.productId },
            data: { inventoryCount: { increment: delta } },
          });
        }
        await writeAuditInTx(tx, {
          actorType: input.actor.type,
          actorId: input.actor.id ?? null,
          action: "return_restock",
          entityType: "return_item",
          entityId: row.id,
          before: { restockedQuantity: row.restocked_quantity },
          after: {
            restockedQuantity: req.restockedQuantity,
            delta,
            productId: target.productId,
            variantId: target.variantId,
            returnId: input.returnId,
          },
          reason: input.reason ?? null,
          correlationId: input.correlationId ?? null,
        });
        applied.push({ returnItemId: row.id, delta, restockedQuantity: req.restockedQuantity });
      }

      // حالة الدورة من واقع البنود كلها (لا من الطلب الحالي وحده)
      const all = await tx.returnItem.findMany({
        where: { returnId: input.returnId },
        select: { quantity: true, restockedQuantity: true },
      });
      const fully = all.every((i) => i.restockedQuantity === i.quantity);
      const any = all.some((i) => i.restockedQuantity > 0);
      const nextStatus: ReturnStatus = fully ? "restocked" : any ? "partially_restocked" : record.status;
      if (nextStatus !== record.status) {
        await tx.returnRecord.update({ where: { id: input.returnId }, data: { status: nextStatus } });
        await writeAuditInTx(tx, {
          actorType: input.actor.type,
          actorId: input.actor.id ?? null,
          action: "return_status_change",
          entityType: "return",
          entityId: input.returnId,
          before: { status: record.status },
          after: { status: nextStatus },
          reason: "تحديث آلي من الاسترجاع",
          correlationId: input.correlationId ?? null,
        });
      }
      return { returnId: input.returnId, status: nextStatus, applied };
    });
  } catch (error) {
    if (!(error instanceof ReturnError)) {
      await raiseSystemAlert({
        type: "return_restock_failed",
        severity: "high",
        message: `فشل استرجاع مخزون دورة الإرجاع ${input.returnId}`,
        entityType: "return",
        entityId: input.returnId,
        metadata: { error: error instanceof Error ? error.message : String(error) },
      });
    }
    throw error;
  }
}

// ===================== قراءة =====================

export const RETURN_PAGE_SIZE_MAX = 100;

export async function listReturns(params: { status?: ReturnStatus; page: number; pageSize: number }) {
  const pageSize = Math.min(Math.max(1, params.pageSize), RETURN_PAGE_SIZE_MAX);
  const where: Prisma.ReturnRecordWhereInput = {
    ...(params.status ? { status: params.status } : {}),
    order: { isTest: false },
  };
  const [items, total] = await Promise.all([
    prisma.returnRecord.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (Math.max(1, params.page) - 1) * pageSize,
      take: pageSize,
      include: {
        order: {
          select: { id: true, orderNumber: true, status: true, customerFirstName: true, customerLastName: true },
        },
        items: { select: { quantity: true, restockedQuantity: true } },
      },
    }),
    prisma.returnRecord.count({ where }),
  ]);
  return { items, total, pageSize };
}

export async function getReturn(id: string) {
  return prisma.returnRecord.findUnique({
    where: { id },
    include: {
      order: {
        select: {
          id: true,
          orderNumber: true,
          status: true,
          customerFirstName: true,
          customerLastName: true,
          isTest: true,
        },
      },
      items: {
        orderBy: { id: "asc" },
        include: {
          orderItem: {
            select: { productNameSnapshot: true, variantLabelSnapshot: true, quantity: true, unitPriceDzd: true },
          },
        },
      },
    },
  });
}

export async function getReturnsForOrder(orderId: string) {
  return prisma.returnRecord.findMany({
    where: { orderId },
    orderBy: [{ cycleNumber: "desc" }],
    include: { items: { select: { id: true, orderItemId: true, quantity: true, restockedQuantity: true } } },
  });
}

export function allowedReturnTransitions(from: ReturnStatus): readonly ReturnStatus[] {
  return RETURN_TRANSITIONS[from];
}

export function isRestockable(status: ReturnStatus): boolean {
  return RESTOCKABLE_STATUSES.includes(status);
}
