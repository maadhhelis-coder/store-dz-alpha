import { after } from "next/server";
import { prisma } from "@/server/db/prisma";
import * as ordersRepository from "@/server/repositories/ordersRepository";
import { writeAuditInTx } from "@/server/services/auditService";
import {
  fireWebhookEvent,
} from "@/server/services/webhooksService";
import {
  sendMetaCapiOrderConfirmed,
  sendMetaCapiOrderDelivered,
} from "@/server/services/metaCapiService";
import {
  sendTikTokOrderConfirmed,
  sendTikTokOrderDelivered,
} from "@/server/services/tiktokEventsApiService";
import { assertTransition, InvalidTransitionError, isCarrierDrivenStatus } from "@/server/modules/orders/stateMachine";
import type { OrderStatus, Prisma } from "@prisma/client";

// خدمة تغيير حالة الطلب الموحدة — كل المسارات (UI/status route، bulk، محاولات
// التأكيد P2، mapping الناقل P5) تمر من هنا حصرًا. داخلها:
// 1. assertTransition (فشل سريع برسالة INVALID_TRANSITION)
// 2. معاملة واحدة: CAS على الحالة + سجل order_status_history + audit + outbox event
// 3. تعديل المخزون عبر المسار القائم (adjustStockForStatusTransition)
// 4. بعد الالتزام: webhook + Meta CAPI/TikTok عبر after() — التزامن نفسه الحالي

export { InvalidTransitionError };

export type StatusChangeActor = {
  type: "admin" | "system" | "api" | "carrier";
  id?: string | null;
};

export type StatusChangeContext = {
  actor: StatusChangeActor;
  reason?: string | null;
  metadata?: Record<string, unknown>;
  correlationId?: string | null;
};

export type OrderWithItems = NonNullable<Awaited<ReturnType<typeof ordersRepository.findOrderById>>>;

// حالات "الطلب لن يُنفَّذ نهائيًا" — نفس دلالات النسخة السابقة حرفيًا (تعليق
// المخزون التاريخي فوقها صالح). الحالات الجديدة لا تضيف عائلة تحرير: الـRTO
// وreturned يمران عبر دورة الإرجاع (restockedQuantity) لا عبر انتقال الحالة.
const STOCK_RELEASING_STATUSES: OrderStatus[] = ["cancelled", "fake", "duplicate", "wrong_number", "returned"];

function isStockReleasingStatus(status: OrderStatus): boolean {
  return STOCK_RELEASING_STATUSES.includes(status);
}

// نفس نمط الحماية الحالي — معاملة CAS على الحالة مع تعديل المخزون.
async function adjustStockForStatusTransition(
  tx: Prisma.TransactionClient,
  items: { productId: string | null; variantId: string | null; quantity: number }[],
  direction: "restore" | "reclaim",
) {
  for (const item of items) {
    if (direction === "restore") {
      if (item.variantId) {
        await tx.productVariant
          .update({ where: { id: item.variantId }, data: { inventoryCount: { increment: item.quantity } } })
          .catch(() => {});
      } else if (item.productId) {
        await tx.product
          .update({ where: { id: item.productId }, data: { inventoryCount: { increment: item.quantity } } })
          .catch(() => {});
      }
    } else {
      if (item.variantId) {
        const result = await tx.productVariant.updateMany({
          where: { id: item.variantId, inventoryCount: { gte: item.quantity } },
          data: { inventoryCount: { decrement: item.quantity } },
        });
        if (result.count === 0) throw new InsufficientStockError();
      } else if (item.productId) {
        const result = await tx.product.updateMany({
          where: { id: item.productId, inventoryCount: { gte: item.quantity } },
          data: { inventoryCount: { decrement: item.quantity } },
        });
        if (result.count === 0) throw new InsufficientStockError();
      }
    }
  }
}

export class InsufficientStockError extends Error {
  constructor() {
    super("الكمية المطلوبة غير متوفرة بالمخزون");
    this.name = "InsufficientStockError";
  }
}

const MAX_STATUS_UPDATE_ATTEMPTS = 3;

/** الانتقال الموحد لحالة الطلب — البديل الرسمي لupdateOrderStatus القديمة. */
export async function transitionOrderStatus(
  id: string,
  to: OrderStatus,
  context: StatusChangeContext,
): Promise<OrderWithItems> {
  for (let attempt = 1; attempt <= MAX_STATUS_UPDATE_ATTEMPTS; attempt++) {
    const existing = await ordersRepository.findOrderById(id);
    if (!existing) throw new OrderNotFoundError();

    // فشل سريع قبل أي كتابة — رسالة INVALID_TRANSITION مفهومة بدل retry عشوائي
    assertTransition(existing.status, to);

    const wasReleasing = isStockReleasingStatus(existing.status);
    const willRelease = isStockReleasingStatus(to);

    if (wasReleasing === willRelease) {
      const updated = await prisma.$transaction(async (tx) => {
        const guarded = await tx.order.updateMany({
          where: { id, status: existing.status },
          data: statusTimestampFields(to),
        });
        if (guarded.count === 0) return null;

        await tx.orderStatusHistory.create({
          data: {
            orderId: id,
            oldStatus: existing.status,
            newStatus: to,
            actorType: context.actor.type,
            actorId: context.actor.id ?? null,
            reason: context.reason ?? null,
            metadata: context.metadata as Prisma.InputJsonValue | undefined,
          },
        });

        await writeAuditInTx(tx, {
          actorType: context.actor.type,
          actorId: context.actor.id ?? null,
          action: "status_change",
          entityType: "order",
          entityId: id,
          before: { status: existing.status },
          after: { status: to },
          reason: context.reason ?? null,
          correlationId: context.correlationId ?? null,
        });

        await createOutboxEvent(tx, {
          eventType: "order.status_changed",
          entityType: "order",
          entityId: id,
          payload: { orderNumber: existing.orderNumber, from: existing.status, to },
          actorType: context.actor.type,
          actorId: context.actor.id ?? null,
          correlationId: context.correlationId ?? null,
        });

        return tx.order.findUniqueOrThrow({ where: { id }, include: { items: true, wilaya: true } });
      });

      if (updated) {
        finalizeStatusSideEffects(existing, updated);
        return updated;
      }
      continue; // تسابق — أعد القراءة
    }

    const updated = await prisma.$transaction(async (tx) => {
      const guarded = await tx.order.updateMany({
        where: { id, status: existing.status },
        data: statusTimestampFields(to),
      });
      if (guarded.count === 0) return null;

      await adjustStockForStatusTransition(tx, existing.items, willRelease ? "restore" : "reclaim");

      await tx.orderStatusHistory.create({
        data: {
          orderId: id,
          oldStatus: existing.status,
          newStatus: to,
          actorType: context.actor.type,
          actorId: context.actor.id ?? null,
          reason: context.reason ?? null,
          metadata: context.metadata as Prisma.InputJsonValue | undefined,
        },
      });

      await writeAuditInTx(tx, {
        actorType: context.actor.type,
        actorId: context.actor.id ?? null,
        action: "status_change",
        entityType: "order",
        entityId: id,
        before: { status: existing.status },
        after: { status: to },
        reason: context.reason ?? null,
        correlationId: context.correlationId ?? null,
      });

      await createOutboxEvent(tx, {
        eventType: "order.status_changed",
        entityType: "order",
        entityId: id,
        payload: { orderNumber: existing.orderNumber, from: existing.status, to },
        actorType: context.actor.type,
        actorId: context.actor.id ?? null,
        correlationId: context.correlationId ?? null,
      });

      return tx.order.findUniqueOrThrow({ where: { id }, include: { items: true, wilaya: true } });
    });

    if (updated) {
      finalizeStatusSideEffects(existing, updated);
      return updated;
    }
  }
  throw new Error("تعذّر تحديث حالة الطلب بعد عدة محاولات متزامنة، حاول من جديد");
}

/** حقول التوقيت الحالية — نفس دلالات ordersRepository (confirmedAt إلخ) منقولة
 * هنا لأن الانتقال أصبح داخل معاملة موحدة مع السجل والتدقيق والـoutbox. */
const DOWNSTREAM_OF_CONFIRMED: OrderStatus[] = ["confirmed", "preparing", "ready_to_ship", "shipped", "in_transit", "out_for_delivery", "delivered", "cod_collected", "return_to_origin", "returned"];
const DOWNSTREAM_OF_DELIVERED: OrderStatus[] = ["delivered", "cod_collected", "returned"];

function statusTimestampFields(to: OrderStatus): Prisma.OrderUpdateManyMutationInput {
  const now = new Date();
  const fields: Prisma.OrderUpdateManyMutationInput = {};
  if (to === "confirmed") fields.confirmedAt = now;
  else if (!DOWNSTREAM_OF_CONFIRMED.includes(to)) fields.confirmedAt = null;
  if (to === "delivered") fields.deliveredAt = now;
  else if (!DOWNSTREAM_OF_DELIVERED.includes(to)) fields.deliveredAt = null;
  if (to === "cancelled") fields.cancelledAt = now;
  else fields.cancelledAt = null;
  if (to === "returned") fields.returnedAt = now;
  else fields.returnedAt = null;
  return fields;
}

// آثار ما بعد الالتزام — نفس المنطق الحالي (webhook + CAPI/TikTok بشرط تغيّر فعلي)
function finalizeStatusSideEffects(existing: OrderWithItems, updated: OrderWithItems) {
  if (existing.status === updated.status) return;

  fireWebhookEvent("order_status_changed", {
    orderId: updated.id,
    orderNumber: updated.orderNumber,
    previousStatus: existing.status,
    status: updated.status,
  });

  // حالات الناقل لا ترسل أحداث تحويل إعلاني — الإعلان يُرسل عند التأكيد والتسليم فقط
  if (!isCarrierDrivenStatus(updated.status) && updated.status !== "returned") {
    const capiOrderContext = {
      orderNumber: updated.orderNumber,
      totalDzd: updated.totalDzd,
      phone: updated.phone,
      firstName: updated.customerFirstName,
      lastName: updated.customerLastName,
    };
    const tiktokOrderContext = {
      orderNumber: updated.orderNumber,
      totalDzd: updated.totalDzd,
      phone: updated.phone,
    };
    if (updated.status === "confirmed") {
      after(() => sendMetaCapiOrderConfirmed(capiOrderContext).catch((error) => console.error("meta capi confirmed error", error)));
      after(() => sendTikTokOrderConfirmed(tiktokOrderContext).catch((error) => console.error("tiktok confirmed error", error)));
    }
    if (updated.status === "delivered") {
      after(() => sendMetaCapiOrderDelivered(capiOrderContext).catch((error) => console.error("meta capi delivered error", error)));
      after(() => sendTikTokOrderDelivered(tiktokOrderContext).catch((error) => console.error("tiktok delivered error", error)));
    }
  }
}

export class OrderNotFoundError extends Error {
  constructor() {
    super("الطلب غير موجود");
    this.name = "OrderNotFoundError";
  }
}

// ===================== Outbox =====================

export type OutboxEventInput = {
  eventType: string;
  entityType: string;
  entityId: string;
  payload: Record<string, unknown>;
  actorType?: string | null;
  actorId?: string | null;
  correlationId?: string | null;
  causationId?: string | null;
  automationDepth?: number;
  originatingHandler?: string | null;
};

/** كتابة حدث outbox داخل نفس المعاملة — الحدث يلتزم مع التغيير التجاري أم
 * يُلغى معه. الإرسال الفعلي يحدث لاحقًا عبر المشغّل (after()/cron) حصرًا. */
export function createOutboxEvent(tx: Prisma.TransactionClient, input: OutboxEventInput) {
  return tx.domainEvent.create({
    data: {
      eventType: input.eventType,
      entityType: input.entityType,
      entityId: input.entityId,
      // الحمولة معرفات+بيانات تشغيلية دنيا فقط — لا PII (الهاتف/العنوان يبقيان
      // في جداول الحقيقة؛ المعالِجات تستعلم عنها عند الحاجة)
      payload: input.payload as Prisma.InputJsonValue,
      actorType: input.actorType ?? null,
      actorId: input.actorId ?? null,
      correlationId: input.correlationId ?? null,
      causationId: input.causationId ?? null,
      automationDepth: input.automationDepth ?? 0,
      originatingHandler: input.originatingHandler ?? null,
    },
  });
}
