import { prisma } from "@/server/db/prisma";
import { writeAudit, writeAuditInTx } from "@/server/services/auditService";
import { createOutboxEvent, transitionOrderStatus } from "@/server/modules/orders/statusService";
import { nudgeOutbox } from "@/server/modules/automation/outboxDrainer";
import { DEFAULT_CARRIER } from "@/server/modules/shipping/carrierAdapter";
import type { Prisma, ShipmentRole, ShipmentStatus } from "@prisma/client";

// خدمة الشحنات — نقطة الإنشاء الوحيدة المصرَّح بها.
//
// العقد: معاملة محلية واحدة تكتب Shipment + shipment_items + audit + حدث
// outbox، ثم **تنتهي**. لا نداء ناقل داخلها إطلاقًا؛ الإرسال الفعلي يقع في
// معالِج الصندوق (shipmentDispatch.ts) خارج أي معاملة.
//
// قاعدة "شحنة نشطة واحدة لكل طلب" مفروضة في القاعدة نفسها بفهرس فريد جزئي
// (shipments_one_active_per_order_idx) لا بالكود — سباق عمليتين يخسره أحدهما
// حتمًا بانتهاك القيد، لا بفحص قرأ ثم كتب.

/** يطابق حرفيًا حالات الفهرس الفريد الجزئي في migration الأساس. */
export const ACTIVE_SHIPMENT_STATUSES: readonly ShipmentStatus[] = [
  "created",
  "handed_over",
  "in_transit",
  "out_for_delivery",
  "return_requested",
];

export type ShipmentErrorCode =
  | "ORDER_NOT_FOUND"
  | "ORDER_NOT_SHIPPABLE"
  | "ORDER_HAS_NO_ITEMS"
  | "ADDRESS_REQUIRED"
  | "ACTIVE_SHIPMENT_EXISTS"
  | "SHIPMENT_NOT_FOUND"
  | "SHIPMENT_NOT_CLOSABLE";

export class ShipmentError extends Error {
  constructor(
    readonly code: ShipmentErrorCode,
    message: string,
    readonly shipmentId?: string,
  ) {
    super(message);
    this.name = "ShipmentError";
  }
}

export type ShipmentActor = { type: "admin" | "system" | "api" | "carrier"; id?: string | null };

/** ترجمة رمز الخطأ إلى حالة HTTP — مشتركة بين مساري الشحن. */
export const SHIPMENT_ERROR_STATUS: Record<ShipmentErrorCode, number> = {
  ORDER_NOT_FOUND: 404,
  SHIPMENT_NOT_FOUND: 404,
  ORDER_NOT_SHIPPABLE: 409,
  ACTIVE_SHIPMENT_EXISTS: 409,
  SHIPMENT_NOT_CLOSABLE: 409,
  ORDER_HAS_NO_ITEMS: 400,
  ADDRESS_REQUIRED: 400,
};

export type CreateShipmentInput = {
  orderId: string;
  actor: ShipmentActor;
  provider?: string;
  role?: ShipmentRole;
  parentShipmentId?: string | null;
  reason?: string | null;
};

/** الحالة الوحيدة التي يجوز فيها إنشاء شحنة — بعدها ينقل نجاح الإرسال الطلب
 * إلى shipped عبر آلة الحالات (ready_to_ship → shipped)، بلا أي تجاوز. */
const SHIPPABLE_ORDER_STATUS = "ready_to_ship";

export async function findActiveShipment(orderId: string) {
  return prisma.shipment.findFirst({
    where: { orderId, status: { in: [...ACTIVE_SHIPMENT_STATUSES] } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
}

export async function createShipment(input: CreateShipmentInput) {
  const { orderId, actor } = input;
  const provider = input.provider ?? DEFAULT_CARRIER;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: { select: { id: true, quantity: true } } },
  });
  if (!order) throw new ShipmentError("ORDER_NOT_FOUND", "الطلب غير موجود");
  if (order.status !== SHIPPABLE_ORDER_STATUS) {
    throw new ShipmentError(
      "ORDER_NOT_SHIPPABLE",
      `لا يمكن إنشاء شحنة لطلب حالته ${order.status} — الحالة المطلوبة ${SHIPPABLE_ORDER_STATUS}`,
    );
  }
  if (order.items.length === 0) {
    throw new ShipmentError("ORDER_HAS_NO_ITEMS", "الطلب بلا أسطر — لا شيء يُشحن");
  }
  // DHD تشترط عنوانًا غير فارغ حتى لمكتب الاستلام؛ العنوان الحقيقي مطلوب للمنزل فقط
  if (order.deliveryOption === "home" && !order.address) {
    throw new ShipmentError("ADDRESS_REQUIRED", "أدخل عنوان الزبون أولًا (مطلوب لتوصيل المنزل)");
  }

  // دورة شحن تالية لنفس الطلب = reship مرتبطة بسابقتها — التاريخ يبقى كاملًا
  const previous = await prisma.shipment.findFirst({
    where: { orderId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true },
  });
  const role: ShipmentRole = input.role ?? (previous ? "reship" : "primary");

  try {
    const shipment = await prisma.$transaction(async (tx) => {
      const created = await tx.shipment.create({
        data: {
          orderId,
          role,
          parentShipmentId: input.parentShipmentId ?? previous?.id ?? null,
          provider,
          status: "created",
          // لقطة رسمية: المبلغ المحصَّل عند الباب هو إجمالي الطلب وقت الشحن
          codAmountDzd: order.totalDzd,
          destWilayaCode: order.wilayaCode,
          destCommune: order.commune,
          items: {
            create: order.items.map((item) => ({
              orderId,
              orderItemId: item.id,
              quantity: item.quantity,
            })),
          },
        },
      });

      await writeAuditInTx(tx, {
        actorType: actor.type,
        actorId: actor.id ?? null,
        action: "shipment_create",
        entityType: "shipment",
        entityId: created.id,
        after: { orderId, provider, role, codAmountDzd: created.codAmountDzd },
        reason: input.reason ?? null,
      });

      // النية محفوظة محليًا قبل أي أثر خارجي — الإرسال يقع في معالِج الصندوق
      await createOutboxEvent(tx, {
        eventType: "shipment.created",
        entityType: "shipment",
        entityId: created.id,
        payload: { orderId, orderNumber: order.orderNumber, provider, role },
        actorType: actor.type,
        actorId: actor.id ?? null,
      });

      return created;
    });

    nudgeOutbox();
    return shipment;
  } catch (error) {
    // الفهرس الفريد الجزئي خام في SQL، فشكل meta غير مضمون — نتحقق من الواقع
    // بدل تفسير رسالة الخطأ: هل توجد شحنة نشطة فعلًا؟
    if (isUniqueViolation(error)) {
      const active = await findActiveShipment(orderId);
      if (active) {
        throw new ShipmentError(
          "ACTIVE_SHIPMENT_EXISTS",
          "هذا الطلب لديه شحنة نشطة بالفعل",
          active.id,
        );
      }
    }
    throw error;
  }
}

export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "P2002"
  );
}

// ===================== إعادة الشحن =====================

/** إعادة فتح دورة شحن لطلب مرتجع.
 *
 * ليست إنشاء شحنة: الشحنة الجديدة تُنشأ بالمسار العادي بعد أن يعود الطلب إلى
 * الدورة، فتُطبَّق عليها قاعدة "شحنة نشطة واحدة" كما هي بلا أي التفاف — لا
 * يمكن أصلًا وجود شحنة نشطة والطلب returned.
 *
 * الانتقال returned→confirmed مرفوض للجميع، ويُفتح هنا فقط عبر allowReship
 * (راجع stateMachine). التزامن: الـCAS داخل transitionOrderStatus يجعل سباق
 * إعادتين ينتهي بفائز واحد — الخاسر يرى INVALID_TRANSITION.
 */
export async function reshipOrder(params: {
  orderId: string;
  actor: ShipmentActor;
  reason: string;
}) {
  const reason = params.reason.trim();
  if (!reason) throw new ShipmentError("SHIPMENT_NOT_CLOSABLE", "سبب إعادة الشحن إلزامي");

  // الترتيب مقصود: الانتقال أولًا لأنه حَكَم السباق (CAS داخل transitionOrderStatus)
  // — الخاسر يرمي INVALID_TRANSITION قبل أن يمسّ أي شحنة. وهو أيضًا الحارس الوحيد
  // للحالة: طلب لم يُرتجع لا يمكن إعادة شحنه، فالانتقال يرفضه من أصله.
  const order = await transitionOrderStatus(params.orderId, "confirmed", {
    actor: params.actor,
    reason,
    allowReship: true,
    metadata: { action: "reship" },
  });

  // إغلاق دورة الشحن السابقة رسميًا. اكتُشف باختبار: الشحنة تبقى نشطة إذا وصل
  // الطلب إلى returned بانتقال بشري بدل أحداث الناقل، فتقفل قاعدةُ "شحنة نشطة
  // واحدة" بابَ إعادة الشحن إلى الأبد. الحالة المكتوبة هنا ليست تخمينًا عن
  // الناقل: هي حالة الطلب نفسها التي سمح بها الانتقال أعلاه (returned حصرًا).
  const closed = await prisma.shipment.updateMany({
    where: { orderId: params.orderId, status: { in: [...ACTIVE_SHIPMENT_STATUSES] } },
    data: { status: "returned" },
  });

  await writeAudit({
    actorType: params.actor.type,
    actorId: params.actor.id ?? null,
    action: "shipment_reship",
    entityType: "order",
    entityId: params.orderId,
    after: { status: order.status, closedShipments: closed.count },
    reason,
  });

  return order;
}

/** شحنة مع كل ما تحتاجه شاشة الطلب وسطر الإرسال. */
export async function getShipmentsForOrder(orderId: string) {
  return prisma.shipment.findMany({
    where: { orderId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: {
      items: { select: { id: true, orderItemId: true, quantity: true } },
      events: {
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        take: 50,
        select: {
          id: true,
          provider: true,
          status: true,
          description: true,
          occurredAt: true,
          providerEventId: true,
        },
      },
    },
  });
}

/** تحديث حقول الطلب التوافقية بعد نجاح الإرسال — courier_* بقيت الحقول التي
 * تقرؤها الواجهة والـwebhook القديم، فتُشتق من الشحنة ولا تصبح مصدر حقيقة. */
export function syncOrderCourierFieldsInTx(
  tx: Prisma.TransactionClient,
  orderId: string,
  provider: string,
  trackingNumber: string,
) {
  return tx.order.update({
    where: { id: orderId },
    data: { courierProvider: provider, courierTrackingId: trackingNumber },
  });
}
