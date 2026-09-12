import { prisma } from "@/server/db/prisma";
import { registerHandler } from "@/server/modules/automation/outboxDrainer";
import { raiseSystemAlert } from "@/server/modules/alerts/alertsService";
import { redactErrorMessage } from "@/lib/redact";
import { writeAuditInTx } from "@/server/services/auditService";
import { transitionOrderStatus } from "@/server/modules/orders/statusService";
import { InvalidTransitionError } from "@/server/modules/orders/stateMachine";
import { getCarrierAdapter, isPermanentCarrierError } from "@/server/modules/shipping/carrierAdapter";
import { syncOrderCourierFieldsInTx } from "@/server/modules/shipping/shipmentService";
import type { DomainEvent } from "@prisma/client";

// إرسال الشحنة للناقل — الأثر الخارجي الوحيد في P5، ويقع هنا حصرًا:
// خارج أي معاملة، من داخل معالِج صندوق الأحداث، بعد أن التزمت النية محليًا.
//
// المرجع الثابت عند المزود هو orderNumber (يُرسَل كـreference) ولا يتغيّر عبر
// إعادة المحاولات. لكن DHD **لا تتيح استعلامًا بهذا المرجع** (نقطة الحالة
// تقبل أرقام تتبّع فقط — راجع fetchDhdOrderStatus)، فلا يمكن سؤالها "هل
// أنشأتَ شحنة لهذا المرجع؟". لذلك تصنيف الفشل هو خط الدفاع:
//
//   permanent  رفض صريح (بيانات/تكامل)  ⇒ status=error + تنبيه، بلا إعادة
//   ambiguous  لم يصل رد (مهلة/شبكة)     ⇒ تنبيه + **بلا إعادة إرسال أعمى**؛
//                                          المطابقة الدورية تحسمها
//   retryable  وصل رد بخطأ HTTP           ⇒ رمي ⇒ الصندوق يعيد (3) ثم dead-letter
//
// إعادة الإرسال العمياء بعد مهلة هي الطريق الوحيد لشحنتين حقيقيتين عند الناقل
// لنفس الطلب — ولذلك هي ممنوعة هنا.

export const DISPATCH_HANDLER = "shipment.created:dispatch";

type FailureKind = "permanent" | "ambiguous" | "retryable";

export function classifyDispatchFailure(error: unknown): FailureKind {
  if (isPermanentCarrierError(error)) return "permanent";
  // fetch يرمي TypeError عند فشل الشبكة، وDOMException عند المهلة/الإجهاض —
  // في الحالتين لم يصلنا رد، فمصير الطلب عند الناقل مجهول.
  if (error instanceof TypeError) return "ambiguous";
  const name = (error as { name?: string } | null)?.name;
  if (name === "TimeoutError" || name === "AbortError") return "ambiguous";
  return "retryable";
}

/** نقل الطلب إلى shipped عبر آلة الحالات — idempotent وبلا أي تجاوز. */
async function ensureOrderShipped(orderId: string, shipmentId: string): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { status: true } });
  if (!order || order.status !== "ready_to_ship") return;

  try {
    await transitionOrderStatus(orderId, "shipped", {
      actor: { type: "carrier" },
      reason: "تسليم الشحنة للناقل",
      metadata: { shipmentId },
    });
  } catch (error) {
    if (!(error instanceof InvalidTransitionError)) throw error;
    // الأثر الخارجي وقع فعلًا؛ إعادة المحاولة لن تغيّر الحالة — تنبيه لا صمت
    await raiseSystemAlert({
      type: "shipment_order_status_conflict",
      severity: "high",
      message: `تعذّر نقل الطلب إلى shipped بعد نجاح الإرسال (${error.from} → ${error.to})`,
      entityType: "shipment",
      entityId: shipmentId,
      metadata: { orderId, from: error.from, to: error.to },
    });
  }
}

export async function dispatchShipment(event: DomainEvent): Promise<void> {
  const shipment = await prisma.shipment.findUnique({
    where: { id: event.entityId },
    include: {
      order: {
        select: {
          id: true,
          orderNumber: true,
          customerFirstName: true,
          customerLastName: true,
          phone: true,
          address: true,
          wilayaCode: true,
          wilayaName: true,
          commune: true,
          totalDzd: true,
          deliveryOption: true,
          notes: true,
          items: { select: { productNameSnapshot: true } },
        },
      },
    },
  });

  if (!shipment) return; // الشحنة اختفت — لا شيء يُرسَل
  const { order } = shipment;

  if (!shipment.trackingNumber) {
    if (shipment.status !== "created") return; // ألغيت/انتهت قبل الإرسال

    const adapter = getCarrierAdapter(shipment.provider);

    // توثيق أن نداءً خارجيًا بدأ — قبل النداء، لا بعده.
    // الشحنة قد تختفي بين القراءة وهذه الكتابة (حذف إداري، تنظيف): لا نداء
    // خارجي على صف غير موجود، ولا خطأ يستهلك محاولات — لا شيء يُرسَل ببساطة.
    const marked = await prisma.shipment.updateMany({
      where: { id: shipment.id, status: "created" },
      data: { retryCount: { increment: 1 } },
    });
    if (marked.count === 0) return;

    let trackingNumber: string;
    try {
      const result = await adapter.dispatch({
        reference: order.orderNumber,
        fullName: `${order.customerFirstName} ${order.customerLastName}`,
        phone: order.phone,
        address:
          order.address ||
          (order.deliveryOption === "home"
            ? `${order.commune}، ${order.wilayaName}`
            : `استلام من مكتب ${shipment.provider} - ${order.commune}`),
        wilayaCode: order.wilayaCode,
        commune: order.commune,
        amountDzd: shipment.codAmountDzd,
        productLabel: order.items.map((i) => i.productNameSnapshot).join(", "),
        deliveryOption: order.deliveryOption,
        note: order.notes ?? undefined,
      });
      trackingNumber = result.trackingNumber;
    } catch (error) {
      await recordDispatchFailure(shipment.id, order.id, order.orderNumber, error);
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.shipment.update({
        where: { id: shipment.id },
        data: {
          trackingNumber,
          status: "handed_over",
          lastSyncedAt: new Date(),
          lastError: null,
        },
      });
      await syncOrderCourierFieldsInTx(tx, order.id, shipment.provider, trackingNumber);
      await writeAuditInTx(tx, {
        actorType: "system",
        actorId: null,
        action: "shipment_dispatch",
        entityType: "shipment",
        entityId: shipment.id,
        after: { provider: shipment.provider, trackingNumber, orderId: order.id },
      });
    });
  }

  await ensureOrderShipped(order.id, shipment.id);
}

async function recordDispatchFailure(
  shipmentId: string,
  orderId: string,
  orderNumber: string,
  error: unknown,
): Promise<void> {
  const kind = classifyDispatchFailure(error);
  const raw = error instanceof Error ? error.message : String(error);
  const message = redactErrorMessage(raw).slice(0, 500);

  await prisma.shipment.update({
    where: { id: shipmentId },
    data: {
      lastError: message,
      lastSyncedAt: new Date(),
      ...(kind === "permanent" ? { status: "error" as const } : {}),
    },
  });

  if (kind === "retryable") {
    throw error instanceof Error ? error : new Error(message);
  }

  await raiseSystemAlert({
    type: kind === "permanent" ? "shipment_dispatch_rejected" : "shipment_dispatch_uncertain",
    severity: kind === "permanent" ? "high" : "critical",
    message:
      kind === "permanent"
        ? `رفض الناقل إنشاء الشحنة للطلب ${orderNumber} — لا إعادة إرسال`
        : `انقطع الاتصال بالناقل أثناء إرسال الطلب ${orderNumber} — مصير الشحنة عنده مجهول، لا إعادة إرسال قبل المطابقة`,
    entityType: "shipment",
    entityId: shipmentId,
    metadata: { orderId, orderNumber, kind, error: message },
  });
}

registerHandler(DISPATCH_HANDLER, dispatchShipment);
