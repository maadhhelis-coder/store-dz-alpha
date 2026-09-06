import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/server/db/prisma";
import { drainOutbox } from "@/server/modules/automation/outboxDrainer";
import { transitionOrderStatus } from "@/server/modules/orders/statusService";
import { createShipment } from "@/server/modules/shipping/shipmentService";
import { ingestCarrierEvent } from "@/server/modules/shipping/shipmentEvents";
import { reconcileShipments } from "@/server/modules/shipping/reconciliation";
import { createDhdShipment, fetchDhdOrderStatus } from "@/server/services/dhdService";
import { createAdmin, cleanupByTag, ensureWilayaCode, newTag, type FixtureTag } from "./support/customerFixtures";

// أحداث الناقل: at-least-once داخلًا، effectively-once معالجةً.
// والمطابقة الدورية: تصحيح آمن عبر نفس البوابة، وتباعد لا يُصلَح بصمت.

vi.mock("@/server/services/dhdService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/services/dhdService")>();
  return { ...actual, createDhdShipment: vi.fn(), fetchDhdOrderStatus: vi.fn() };
});

const dispatchMock = vi.mocked(createDhdShipment);
const statusMock = vi.mocked(fetchDhdOrderStatus);
const maybeDescribe = process.env.TEST_DATABASE_URL ? describe : describe.skip;

maybeDescribe("أحداث الناقل والمطابقة (integration)", () => {
  let tag: FixtureTag;
  let adminId: string;
  let wilayaCode: number;

  beforeAll(async () => {
    tag = newTag("shev");
    wilayaCode = await ensureWilayaCode();
    adminId = await createAdmin(tag);
  });

  beforeEach(async () => {
    dispatchMock.mockReset();
    statusMock.mockReset();
    dispatchMock.mockImplementation(async (input) => ({
      tracking: `TRK-${input.reference}`,
      raw: {},
    }));
    statusMock.mockResolvedValue({ tracking: "x", status: null });
    await drainAll();
  });

  /** التصريف دفعته 20 حدثًا: مع تراكم ملفات الاختبار الأخرى في نفس القاعدة قد
   * لا يصل حدثنا في تصريفة واحدة. نصرّف حتى يفرغ الصندوق. */
  async function drainAll(maxRounds = 40): Promise<void> {
    for (let i = 0; i < maxRounds; i++) {
      const pending = await prisma.domainEvent.count({
        where: { status: { in: ["pending", "processing"] } },
      });
      if (pending === 0) return;
      await drainOutbox();
    }
  }

  afterAll(async () => {
    const orders = await prisma.order.findMany({
      where: { orderNumber: { contains: tag } },
      select: { id: true },
    });
    const ids = orders.map((o) => o.id);
    await prisma.shipmentEvent.deleteMany({ where: { shipment: { orderId: { in: ids } } } });
    await prisma.shipmentItem.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.shipment.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.automationRun.deleteMany({ where: { event: { entityId: { in: ids } } } });
    await prisma.domainEvent.deleteMany({ where: { entityId: { in: ids } } });
    await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { entityId: { in: ids } } });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.order.deleteMany({ where: { id: { in: ids } } });
    await cleanupByTag(tag);
  });

  async function shippedShipment() {
    const order = await prisma.order.create({
      data: {
        orderNumber: `EVT-${tag}-${Math.random().toString(36).slice(2, 8)}`,
        status: "pending",
        customerFirstName: "حدث",
        customerLastName: "ناقل",
        phone: "0550000012",
        wilayaCode,
        wilayaName: "اختبار",
        commune: "اختبار",
        address: "شارع 3",
        deliveryOption: "home",
        deliveryPriceDzd: 0,
        itemsSubtotalDzd: 1000,
        totalDzd: 1000,
        isTest: false,
        items: {
          create: [
            {
              productNameSnapshot: "منتج",
              productSlugSnapshot: "p",
              unitPriceDzd: 1000,
              quantity: 1,
              lineTotalDzd: 1000,
            },
          ],
        },
      },
      select: { id: true, orderNumber: true },
    });
    for (const next of ["confirmed", "preparing", "ready_to_ship"] as const) {
      await transitionOrderStatus(order.id, next, { actor: { type: "system" } });
    }
    const shipment = await createShipment({ orderId: order.id, actor: { type: "admin", id: adminId } });
    await drainAll();
    const dispatched = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    // شرط مسبق صريح: بقية الاختبار بلا معنى بلا إرسال ناجح
    expect(dispatched.trackingNumber).not.toBeNull();
    return { orderId: order.id, orderNumber: order.orderNumber, shipment: dispatched };
  }

  // --------------------------------------------------------------- 1 تطبيق
  it("حدث معروف يتقدّم بالشحنة وينقل الطلب عبر آلة الحالات", async () => {
    const { orderId, shipment } = await shippedShipment();

    const result = await ingestCarrierEvent({
      provider: "DHD",
      trackingNumber: shipment.trackingNumber,
      rawStatus: "En transit",
      rawPayload: { data: { state: { title: "En transit" } } },
    });

    expect(result.outcome).toBe("applied");
    expect(result.shipmentStatus).toBe("in_transit");

    const saved = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    expect(saved.status).toBe("in_transit");
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true } });
    expect(order.status).toBe("in_transit");
    expect(await prisma.shipmentEvent.count({ where: { shipmentId: shipment.id } })).toBe(1);
  });

  // ------------------------------------------------------------ 2 تكرار
  it("إعادة إرسال نفس الحدث لا تُنتج أثرًا ثانيًا (لا حدث ولا سجل حالة)", async () => {
    const { orderId, shipment } = await shippedShipment();
    const payload = {
      provider: "DHD",
      trackingNumber: shipment.trackingNumber,
      rawStatus: "Sorti en livraison",
    };

    const first = await ingestCarrierEvent(payload);
    expect(first.outcome).toBe("applied");

    const historyBefore = await prisma.orderStatusHistory.count({ where: { orderId } });

    const second = await ingestCarrierEvent(payload);
    const third = await ingestCarrierEvent(payload);
    expect(second.outcome).toBe("duplicate");
    expect(third.outcome).toBe("duplicate");

    expect(await prisma.shipmentEvent.count({ where: { shipmentId: shipment.id } })).toBe(1);
    expect(await prisma.orderStatusHistory.count({ where: { orderId } })).toBe(historyBefore);
  });

  // -------------------------------------------------- 3 تكرار متزامن
  it("حدثان متطابقان متزامنان: أثر واحد فقط", async () => {
    const { orderId, shipment } = await shippedShipment();
    const payload = { provider: "DHD", trackingNumber: shipment.trackingNumber, rawStatus: "En transit" };

    const [a, b] = await Promise.all([ingestCarrierEvent(payload), ingestCarrierEvent(payload)]);
    const outcomes = [a.outcome, b.outcome].sort();
    expect(outcomes).toEqual(["applied", "duplicate"]);

    expect(await prisma.shipmentEvent.count({ where: { shipmentId: shipment.id } })).toBe(1);
    expect(
      await prisma.orderStatusHistory.count({ where: { orderId, newStatus: "in_transit" } }),
    ).toBe(1);
  });

  // ---------------------------------------------- 4 وصول خارج الترتيب
  it("حدث خارج ترتيبه يُحفظ ولا يُرجع الحالة للخلف أبدًا", async () => {
    const { orderId, shipment } = await shippedShipment();
    await ingestCarrierEvent({
      provider: "DHD",
      trackingNumber: shipment.trackingNumber,
      rawStatus: "Livré",
    });

    const late = await ingestCarrierEvent({
      provider: "DHD",
      trackingNumber: shipment.trackingNumber,
      rawStatus: "En transit",
    });

    expect(late.outcome).toBe("no_advance");
    const saved = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    expect(saved.status).toBe("delivered");
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true } });
    expect(order.status).toBe("delivered");
    // محفوظ وموثّق رغم أنه لم يُطبَّق
    expect(await prisma.shipmentEvent.count({ where: { shipmentId: shipment.id } })).toBe(2);
  });

  // ------------------------------------------------- 5 حالة مجهولة
  it("حالة غير موثّقة: تُحفظ خامًا وتُرفع للمراجعة ولا تُخمَّن", async () => {
    const { orderId, shipment } = await shippedShipment();

    const result = await ingestCarrierEvent({
      provider: "DHD",
      trackingNumber: shipment.trackingNumber,
      rawStatus: "Statut totalement inconnu",
      rawPayload: { data: { state: { title: "Statut totalement inconnu" } } },
    });

    expect(result.outcome).toBe("unknown_status");
    const event = await prisma.shipmentEvent.findFirstOrThrow({ where: { shipmentId: shipment.id } });
    expect(event.status).toBeNull();
    expect(event.rawPayload).not.toBeNull();

    const saved = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    expect(saved.status).toBe("handed_over"); // بلا تغيير
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true } });
    expect(order.status).toBe("shipped");

    await prisma.systemAlert.findFirstOrThrow({
      where: { type: "shipment_status_unknown", entityId: shipment.id },
    });
  });

  // ------------------------------------------- 6 حدث بلا شحنة مطابقة
  it("حدث بلا شحنة محلية: تنبيه لا صمت", async () => {
    const result = await ingestCarrierEvent({
      provider: "DHD",
      trackingNumber: `GHOST-${tag}`,
      rawStatus: "Livré",
    });
    expect(result.outcome).toBe("shipment_not_found");
    await prisma.systemAlert.findFirstOrThrow({
      where: { type: "shipment_event_unmatched", metadata: { path: ["trackingNumber"], equals: `GHOST-${tag}` } },
    });
  });

  // ------------------------------- 7 المطابقة: تصحيح آمن عبر نفس البوابة
  it("المطابقة الدورية تُقدّم الشحنة عبر بوابة الأحداث نفسها (لا كتابة مباشرة)", async () => {
    const { orderId, shipment } = await shippedShipment();
    statusMock.mockResolvedValue({ tracking: shipment.trackingNumber!, status: "Livré" });

    await reconcileShipments();

    const saved = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    expect(saved.status).toBe("delivered");
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true } });
    expect(order.status).toBe("delivered");
    // مرّت من البوابة ⇒ سجل حدث موجود، لا تحديث صامت
    expect(await prisma.shipmentEvent.count({ where: { shipmentId: shipment.id } })).toBe(1);

    const log = await prisma.integrationSyncLog.findFirstOrThrow({
      where: { integration: "shipping_reconciliation" },
      orderBy: { startedAt: "desc" },
    });
    expect(log.status).toBe("success");
  });

  // -------------------------------------- 8 المطابقة: تباعد بلا إصلاح صامت
  it("شحنة بلا رقم تتبّع بعد محاولة إرسال: تنبيه حرج ولا إعادة إرسال", async () => {
    const { shipment } = await (async () => {
      const order = await prisma.order.create({
        data: {
          orderNumber: `EVT-${tag}-${Math.random().toString(36).slice(2, 8)}`,
          status: "pending",
          customerFirstName: "تباعد",
          customerLastName: "مطابقة",
          phone: "0550000013",
          wilayaCode,
          wilayaName: "اختبار",
          commune: "اختبار",
          address: "شارع 4",
          deliveryOption: "home",
          deliveryPriceDzd: 0,
          itemsSubtotalDzd: 900,
          totalDzd: 900,
          isTest: false,
          items: {
            create: [
              {
                productNameSnapshot: "منتج",
                productSlugSnapshot: "p",
                unitPriceDzd: 900,
                quantity: 1,
                lineTotalDzd: 900,
              },
            ],
          },
        },
        select: { id: true },
      });
      for (const next of ["confirmed", "preparing", "ready_to_ship"] as const) {
        await transitionOrderStatus(order.id, next, { actor: { type: "system" } });
      }
      const created = await createShipment({ orderId: order.id, actor: { type: "admin", id: adminId } });
      return { shipment: created };
    })();

    // حالة "بدأ الإرسال ولم يعد رد" — نحاكيها بما يكتبه المعالِج فعلًا
    await prisma.shipment.update({
      where: { id: shipment.id },
      data: {
        retryCount: 1,
        lastError: "TimeoutError",
        lastSyncedAt: new Date(Date.now() - 6 * 60 * 60 * 1000),
      },
    });

    const before = dispatchMock.mock.calls.length;
    const result = await reconcileShipments();
    expect(result.stale).toBeGreaterThanOrEqual(1);
    // المطابقة لا تُرسل شيئًا — لا نداء ناقل إضافي إطلاقًا
    expect(dispatchMock.mock.calls.length).toBe(before);

    const alert = await prisma.systemAlert.findFirstOrThrow({
      where: { type: "shipment_reconciliation_divergence", entityId: shipment.id },
      select: { severity: true },
    });
    expect(alert.severity).toBe("critical");

    const untouched = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    expect(untouched.trackingNumber).toBeNull();
    expect(untouched.status).toBe("created"); // لا إصلاح صامت
  });
});
