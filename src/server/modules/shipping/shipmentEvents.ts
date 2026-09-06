import { prisma } from "@/server/db/prisma";
import { hashIdempotentRequest } from "@/server/modules/idempotency/durableIdempotency";
import { raiseSystemAlert } from "@/server/modules/alerts/alertsService";
import { redactProviderPayload } from "@/lib/redact";
import { transitionOrderStatus } from "@/server/modules/orders/statusService";
import { InvalidTransitionError } from "@/server/modules/orders/stateMachine";
import { isUniqueViolation, ACTIVE_SHIPMENT_STATUSES } from "@/server/modules/shipping/shipmentService";
import {
  advancesShipment,
  mapCarrierStatus,
  orderStatusForShipment,
} from "@/server/modules/shipping/statusMapping";
import type { Prisma, ShipmentStatus } from "@prisma/client";

// استقبال أحداث الناقل — التسليم at-least-once، والمعالجة effectively-once.
//
// البوابة هي INSERT في shipment_events، وهي أول ما يحدث قبل أي أثر:
//   1. UNIQUE(provider, provider_event_id) جزئي  ← الأولوية حين يوفّر المزود معرّفًا
//   2. UNIQUE(shipment_id, content_hash)          ← الاحتياط دائمًا
// أي تكرار (حتى متزامن) يخسر الـINSERT فيعود duplicate بلا حالة ولا مخزون ولا
// مال ولا أتمتة. لا فحص "هل موجود؟" ثم إدراج — ذلك سباق مفتوح.
//
// الترتيب: أحداث خارج ترتيبها تُحفظ كاملة وتُوثّق، ولا تُرجع الحالة للخلف أبدًا
// (advancesShipment على رتبة التقدّم). الحالة المجهولة لا تُخمَّن: تُحفظ خامًا
// (منقّحة) ويُرفع تنبيه مراجعة.

export type CarrierEventInput = {
  provider: string;
  trackingNumber?: string | null;
  /** المرجع الثابت = orderNumber — مطابقة احتياطية حين يغيب رقم التتبّع. */
  reference?: string | null;
  rawStatus: string;
  description?: string | null;
  providerEventId?: string | null;
  occurredAt?: Date;
  rawPayload?: unknown;
};

export type IngestOutcome =
  | "shipment_not_found"
  | "duplicate"
  | "unknown_status"
  | "no_advance"
  | "applied";

export type IngestResult = {
  outcome: IngestOutcome;
  shipmentId?: string;
  shipmentStatus?: ShipmentStatus;
  orderStatusChanged?: boolean;
};

async function resolveShipment(input: CarrierEventInput) {
  if (input.trackingNumber) {
    const byTracking = await prisma.shipment.findFirst({
      where: { provider: input.provider, trackingNumber: input.trackingNumber },
      select: { id: true, orderId: true, status: true },
    });
    if (byTracking) return byTracking;
  }
  if (input.reference) {
    // المرجع الثابت: الشحنة النشطة للطلب صاحب هذا الرقم
    return prisma.shipment.findFirst({
      where: {
        provider: input.provider,
        order: { orderNumber: input.reference },
        status: { in: [...ACTIVE_SHIPMENT_STATUSES] },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true, orderId: true, status: true },
    });
  }
  return null;
}

export async function ingestCarrierEvent(input: CarrierEventInput): Promise<IngestResult> {
  const shipment = await resolveShipment(input);
  if (!shipment) {
    // ليس صمتًا: حدث ناقل بلا شحنة محلية = تباعد يستحق مراجعة بشرية
    await raiseSystemAlert({
      type: "shipment_event_unmatched",
      severity: "high",
      message: `حدث من ${input.provider} بلا شحنة محلية مطابقة (${input.trackingNumber ?? input.reference ?? "بلا مرجع"})`,
      entityType: "shipment",
      entityId: null,
      metadata: {
        provider: input.provider,
        trackingNumber: input.trackingNumber,
        reference: input.reference,
        rawStatus: input.rawStatus,
      },
    });
    return { outcome: "shipment_not_found" };
  }

  const mapped = mapCarrierStatus(input.rawStatus);
  const occurredAt = input.occurredAt ?? new Date();
  // البصمة تُبنى من الحقول **الواردة** فقط. الطابع الافتراضي (الآن) يُخزَّن ولا
  // يدخل البصمة أبدًا: لو دخل، لأعطت كل إعادة إرسال لنفس الـwebhook بصمة جديدة
  // فسقط إلغاء التكرار من أساسه. الأثر المقصود: حدثان متطابقان تمامًا بلا طابع
  // من المزود يُعدّان واحدًا — تحفّظ مقصود (تسجيل ناقص أفضل من أثر مزدوج).
  const contentHash = hashIdempotentRequest("carrier_event", {
    provider: input.provider,
    shipmentId: shipment.id,
    rawStatus: input.rawStatus,
    providerEventId: input.providerEventId ?? null,
    occurredAt: input.occurredAt?.toISOString() ?? null,
  });

  // البوابة: أول أثر وأوحده قبل أي تغيير حالة
  try {
    await prisma.shipmentEvent.create({
      data: {
        shipmentId: shipment.id,
        provider: input.provider,
        contentHash,
        providerEventId: input.providerEventId ?? null,
        status: mapped,
        description: input.description ?? input.rawStatus,
        rawPayload: input.rawPayload
          ? (redactProviderPayload(input.rawPayload) as Prisma.InputJsonValue)
          : undefined,
        occurredAt,
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { outcome: "duplicate", shipmentId: shipment.id };
    throw error;
  }

  if (!mapped) {
    await raiseSystemAlert({
      type: "shipment_status_unknown",
      severity: "medium",
      message: `حالة غير موثّقة من ${input.provider}: «${input.rawStatus}» — لم تُترجَم ولم تُخمَّن`,
      entityType: "shipment",
      entityId: shipment.id,
      metadata: { rawStatus: input.rawStatus, orderId: shipment.orderId },
    });
    return { outcome: "unknown_status", shipmentId: shipment.id };
  }

  if (!advancesShipment(shipment.status, mapped)) {
    // خارج الترتيب أو مكرر منطقيًا — محفوظ وموثّق، بلا تراجع
    return { outcome: "no_advance", shipmentId: shipment.id, shipmentStatus: shipment.status };
  }

  // CAS على الحالة السابقة — حدثان متزامنان لا يكتبان معًا
  const advanced = await prisma.shipment.updateMany({
    where: { id: shipment.id, status: shipment.status },
    data: { status: mapped, lastSyncedAt: new Date() },
  });
  if (advanced.count === 0) {
    return { outcome: "no_advance", shipmentId: shipment.id, shipmentStatus: shipment.status };
  }

  const orderStatus = orderStatusForShipment(mapped);
  let orderStatusChanged = false;
  if (orderStatus) {
    try {
      await transitionOrderStatus(shipment.orderId, orderStatus, {
        actor: { type: "carrier" },
        reason: `حالة ناقل: ${input.rawStatus}`,
        metadata: { shipmentId: shipment.id, provider: input.provider },
      });
      orderStatusChanged = true;
    } catch (error) {
      if (!(error instanceof InvalidTransitionError)) throw error;
      // الطلب لا يقبل هذا الانتقال (سبقه انتقال يدوي مثلًا) — لا تجاوز، تنبيه
      await raiseSystemAlert({
        type: "shipment_order_status_conflict",
        severity: "medium",
        message: `حالة الناقل ${mapped} لا تنطبق على الطلب (${error.from} → ${error.to})`,
        entityType: "shipment",
        entityId: shipment.id,
        metadata: { orderId: shipment.orderId, from: error.from, to: error.to },
      });
    }
  }

  return { outcome: "applied", shipmentId: shipment.id, shipmentStatus: mapped, orderStatusChanged };
}
