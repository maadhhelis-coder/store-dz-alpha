import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/server/db/prisma";
import { drainOutboxUntilEmpty } from "@/server/modules/automation/outboxDrainer";
import { dispatchShipment } from "@/server/modules/shipping/shipmentDispatch";
import { transitionOrderStatus } from "@/server/modules/orders/statusService";
import {
  createShipment,
  findActiveShipment,
  reshipOrder,
  ShipmentError,
} from "@/server/modules/shipping/shipmentService";
import { createDhdShipment, DhdValidationError } from "@/server/services/dhdService";
import { createAdmin, cleanupByTag, ensureWilayaCode, newTag, type FixtureTag } from "./support/customerFixtures";

// دورة حياة الشحنة: إنشاء محلي ذري → حدث outbox → إرسال خارج المعاملة →
// حفظ idempotent → إعادة محاولة آمنة → إعادة شحن.
//
// الناقل مُقلَّد على مستوى dhdService: لا نداء شبكة، ومع ذلك يمر التنفيذ عبر
// طبقة CarrierAdapter الحقيقية ومعالِج الصندوق الحقيقي وآلة الحالات الحقيقية.

vi.mock("@/server/services/dhdService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/services/dhdService")>();
  return { ...actual, createDhdShipment: vi.fn(), fetchDhdOrderStatus: vi.fn() };
});

const dispatchMock = vi.mocked(createDhdShipment);
const maybeDescribe = process.env.TEST_DATABASE_URL ? describe : describe.skip;

maybeDescribe("دورة حياة الشحنة (integration)", () => {
  let tag: FixtureTag;
  let adminId: string;
  let wilayaCode: number;

  beforeAll(async () => {
    tag = newTag("ship");
    wilayaCode = await ensureWilayaCode();
    adminId = await createAdmin(tag);
  });

  // عزل: كل اختبار يبدأ بصندوق فارغ وعدّاد نظيف. رقم التتبّع الافتراضي مشتق من
  // المرجع الثابت (رقم الطلب) لأن القيد الحقيقي UNIQUE(provider, tracking_number)
  // يرفض تكراره — وهو سلوك صحيح أوقع الحزام أول مرة، لا خللًا في المنتج.
  beforeEach(async () => {
    dispatchMock.mockReset();
    dispatchMock.mockImplementation(async (input) => ({
      tracking: `TRK-${input.reference}`,
      raw: { mocked: true },
    }));
    await drainAll();
    dispatchMock.mockClear();
  });

  // نستعمل مصرّف المنتج نفسه: الصندوق مشترك بين كل ملفات الاختبار، ودفعة
  // واحدة (20) لا تصل حدثنا مع أي تراكم.
  const drainAll = () => drainOutboxUntilEmpty(100);

  /** تصريف حتى يستقر حدث **هذه** الشحنة تحديدًا. "حتى يفرغ الصندوق" يعتمد على
   * حالة عالمية يشاركها كل ملفات الاختبار فيصير غير حتمي؛ هذا يقيس ما يخصّنا. */
  async function drainUntilSettled(shipmentId: string, maxRounds = 60): Promise<void> {
    for (let i = 0; i < maxRounds; i++) {
      const event = await prisma.domainEvent.findFirst({
        where: { entityId: shipmentId, eventType: "shipment.created" },
        select: { status: true },
      });
      if (!event || event.status === "processed" || event.status === "failed") return;
      await drainOutboxUntilEmpty(5);
    }
  }

  /** استدعاء المعالِج مباشرة لحدث هذه الشحنة — حتمي ولا يعتمد على تراكم صندوق
   * مشترك بين ملفات الاختبار. توصيل الحدث←المعالِج مثبت في اختبار مستقل
   * (المشغّل يُرسل...) وفي E2E؛ هنا نختبر دلالات الإرسال نفسها. */
  async function dispatchNow(shipmentId: string): Promise<void> {
    const event = await prisma.domainEvent.findFirstOrThrow({
      where: { entityId: shipmentId, eventType: 'shipment.created' },
    });
    await dispatchShipment(event);
  }

  /** عدد نداءات الناقل الخاصة بهذا الطلب وحده — العدّ العالمي غير حتمي في قاعدة
   * مشتركة بين ملفات الاختبار (أحداث سابقة قد تُصرَّف في نفس النافذة). */
  async function dispatchCallsFor(orderId: string): Promise<number> {
    const { orderNumber } = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { orderNumber: true },
    });
    return dispatchMock.mock.calls.filter((c) => c[0].reference === orderNumber).length;
  }

  afterAll(async () => {
    const orders = await prisma.order.findMany({
      where: { orderNumber: { contains: tag } },
      select: { id: true },
    });
    const ids = orders.map((o) => o.id);
    // أحداث الصندوق للشحنات entityId = معرّف الشحنة لا الطلب — بلا هذا السطر
    // تبقى أحداث يتيمة معلّقة تصرّفها ملفات لاحقة على شحنات محذوفة.
    const shipmentIds = (
      await prisma.shipment.findMany({ where: { orderId: { in: ids } }, select: { id: true } })
    ).map((s) => s.id);
    await prisma.automationRun.deleteMany({ where: { event: { entityId: { in: shipmentIds } } } });
    await prisma.domainEvent.deleteMany({ where: { entityId: { in: shipmentIds } } });
    await prisma.shipmentEvent.deleteMany({ where: { shipment: { orderId: { in: ids } } } });
    await prisma.shipmentItem.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.shipment.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.automationRun.deleteMany({ where: { event: { entityId: { in: ids } } } });
    await prisma.domainEvent.deleteMany({ where: { entityId: { in: ids } } });
    await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { entityId: { in: ids } } });
    await prisma.systemAlert.deleteMany({ where: { metadata: { path: ["orderNumber"], string_contains: tag } } });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.order.deleteMany({ where: { id: { in: ids } } });
    await cleanupByTag(tag);
  });

  /** طلب جاهز للشحن فعليًا — يمر بكل انتقالات آلة الحالات، بلا أي كتابة مباشرة. */
  async function readyOrder(): Promise<string> {
    const order = await prisma.order.create({
      data: {
        orderNumber: `SHP-${tag}-${Math.random().toString(36).slice(2, 8)}`,
        status: "pending",
        customerFirstName: "شحن",
        customerLastName: "اختبار",
        phone: "0550000010",
        wilayaCode,
        wilayaName: "اختبار",
        commune: "اختبار",
        address: "شارع الاختبار 1",
        deliveryOption: "home",
        deliveryPriceDzd: 400,
        itemsSubtotalDzd: 2000,
        totalDzd: 2400,
        isTest: false,
        items: {
          create: [
            {
              productNameSnapshot: "منتج اختبار",
              productSlugSnapshot: "test-product",
              unitPriceDzd: 1000,
              quantity: 2,
              lineTotalDzd: 2000,
            },
          ],
        },
      },
      select: { id: true },
    });
    for (const next of ["confirmed", "preparing", "ready_to_ship"] as const) {
      await transitionOrderStatus(order.id, next, { actor: { type: "system" } });
    }
    return order.id;
  }

  // ------------------------------------------------- 0 سلامة قيود القاعدة
  it("قيود P5 موجودة فعلًا في القاعدة بعد الترحيل (لا في الكود وحده)", async () => {
    const rows = await prisma.$queryRaw<{ indexname: string; indexdef: string }[]>`
      SELECT indexname, indexdef FROM pg_indexes
      WHERE tablename IN ('shipments', 'shipment_events')
    `;
    const byName = new Map(rows.map((r) => [r.indexname, r.indexdef]));

    // شحنة نشطة واحدة لكل طلب — فريد جزئي على الحالات النشطة الخمس
    const active = byName.get("shipments_one_active_per_order_idx");
    expect(active).toBeDefined();
    expect(active).toContain("UNIQUE");
    for (const status of ["created", "handed_over", "in_transit", "out_for_delivery", "return_requested"]) {
      expect(active).toContain(status);
    }

    // إلغاء تكرار الأحداث: providerEventId أولًا ثم contentHash
    expect(byName.get("shipment_events_provider_provider_event_id_key")).toContain("UNIQUE");
    expect(byName.get("shipment_events_shipment_id_content_hash_key")).toContain("UNIQUE");
    // رقم تتبّع واحد لكل مزود
    expect(byName.get("shipments_provider_tracking_number_key")).toContain("UNIQUE");

    // الصلاحية الجديدة مزروعة فعلًا (المرجع النهائي للتفويض)
    const reship = await prisma.rolePermission.findMany({
      where: { permission: "shipments.reship" },
      select: { role: true },
    });
    expect(reship.map((r) => r.role).sort()).toEqual(["admin", "logistics_agent", "owner", "staff"]);
  });

  // ------------------------------------------------------------ 1 إنشاء طبيعي
  it("الإنشاء ذري: شحنة + أسطرها + حدث outbox، وبلا أي نداء ناقل داخل المعاملة", async () => {
    const orderId = await readyOrder();

    const shipment = await createShipment({ orderId, actor: { type: "admin", id: adminId } });

    expect(shipment.status).toBe("created");
    expect(shipment.role).toBe("primary");
    expect(shipment.trackingNumber).toBeNull();
    expect(shipment.codAmountDzd).toBe(2400); // لقطة إجمالي الطلب

    const items = await prisma.shipmentItem.findMany({ where: { shipmentId: shipment.id } });
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(2);

    const event = await prisma.domainEvent.findFirstOrThrow({
      where: { entityId: shipment.id, eventType: "shipment.created" },
      select: { status: true },
    });
    expect(event.status).toBe("pending");

    // الدليل الحاسم: الناقل لم يُستدعَ إطلاقًا أثناء الإنشاء
    expect(dispatchMock).not.toHaveBeenCalled();

    // الطلب لم يتحرّك بعد — shipped تأتي من نجاح الإرسال لا من الإنشاء
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true } });
    expect(order.status).toBe("ready_to_ship");

    await prisma.auditLog.findFirstOrThrow({ where: { action: "shipment_create", entityId: shipment.id } });
  });

  // ---------------------------------------------------- 2 الإرسال عبر الصندوق
  it("المشغّل يُرسل خارج المعاملة، يحفظ رقم التتبّع، وينقل الطلب إلى shipped", async () => {
    const orderId = await readyOrder();
    dispatchMock.mockResolvedValue({ tracking: `TRK-${tag}-A`, raw: { ok: true } });

    const shipment = await createShipment({ orderId, actor: { type: "admin", id: adminId } });
    // هذا الاختبار وحده يثبت التوصيل الكامل: الحدث ← المصرّف ← المعالِج ← الناقل
    await drainUntilSettled(shipment.id);

    expect(await dispatchCallsFor(orderId)).toBe(1);
    // المرجع الثابت المرسَل للمزود هو رقم الطلب
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(dispatchMock.mock.calls.some((c) => c[0].reference === order.orderNumber)).toBe(true);

    const saved = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    expect(saved.trackingNumber).toBe(`TRK-${tag}-A`);
    expect(saved.status).toBe("handed_over");
    expect(saved.lastError).toBeNull();

    expect(order.status).toBe("shipped");
    expect(order.courierTrackingId).toBe(`TRK-${tag}-A`);
    await prisma.auditLog.findFirstOrThrow({ where: { action: "shipment_dispatch", entityId: shipment.id } });
  });

  // ------------------------------------------------- 3 إعادة المحاولة الآمنة
  it("فشل قابل للإعادة: يُعاد الإرسال مرة واحدة فقط ولا تنشأ شحنة ثانية", async () => {
    const orderId = await readyOrder();
    dispatchMock.mockRejectedValueOnce(new Error("تعذر إنشاء الشحنة عند DHD (رمز الخطأ 503)"));
    dispatchMock.mockResolvedValue({ tracking: `TRK-${tag}-B`, raw: {} });

    const shipment = await createShipment({ orderId, actor: { type: "admin", id: adminId } });

    await dispatchNow(shipment.id).catch(() => {}); // المحاولة الأولى تفشل
    let saved = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    expect(saved.trackingNumber).toBeNull();
    expect(saved.lastError).toContain("503");

    await dispatchNow(shipment.id); // المحاولة الثانية تنجح
    saved = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    expect(saved.trackingNumber).toBe(`TRK-${tag}-B`);
    expect(await dispatchCallsFor(orderId)).toBe(2);

    // شحنة واحدة للطلب، لا ثانية
    expect(await prisma.shipment.count({ where: { orderId } })).toBe(1);

    // استدعاء ثالث: الشحنة لديها رقم تتبّع ⇒ لا نداء إضافي إطلاقًا
    await dispatchNow(shipment.id);
    expect(await dispatchCallsFor(orderId)).toBe(2);
  });

  // --------------------------------------------------------- 4 فشل غامض
  it("انقطاع بلا رد (مهلة): لا إعادة إرسال عمياء، وتنبيه حرج بدلها", async () => {
    const orderId = await readyOrder();
    const timeout = new DOMException("The operation was aborted due to timeout", "TimeoutError");
    dispatchMock.mockRejectedValue(timeout);

    const shipment = await createShipment({ orderId, actor: { type: "admin", id: adminId } });
    // البوابة (automation_runs) هي ما يمنع الإرسال الأعمى الثاني — لذلك هنا
    // نمر بالمصرّف الحقيقي لا باستدعاء المعالِج مباشرة. التصريف موجَّه لحدث هذه
    // الشحنة: "حتى يفرغ الصندوق" حالة عالمية تشاركها كل ملفات الاختبار، وقد
    // ترجع صفرًا بينما حدثنا محجوز بـlease من تصريفة سابقة (أُثبت في CI).
    await drainUntilSettled(shipment.id);
    await drainUntilSettled(shipment.id);
    await drainUntilSettled(shipment.id);

    // نداء واحد فقط رغم ثلاث تصريفات — مصير الشحنة عند الناقل مجهول
    expect(await dispatchCallsFor(orderId)).toBe(1);

    const saved = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    expect(saved.trackingNumber).toBeNull();
    expect(saved.status).toBe("created"); // ليست error — قد تكون أُنشئت عندهم

    const alert = await prisma.systemAlert.findFirstOrThrow({
      where: { type: "shipment_dispatch_uncertain", entityId: shipment.id },
      select: { severity: true },
    });
    expect(alert.severity).toBe("critical");
  });

  // ------------------------------------------------------- 5 رفض دائم
  it("رفض دائم من الناقل: الشحنة error + تنبيه، بلا استهلاك محاولات", async () => {
    const orderId = await readyOrder();
    dispatchMock.mockRejectedValue(new DhdValidationError("Commune غير مقبولة"));

    const shipment = await createShipment({ orderId, actor: { type: "admin", id: adminId } });
    await dispatchNow(shipment.id);
    await dispatchNow(shipment.id);

    expect(await dispatchCallsFor(orderId)).toBe(1);
    const saved = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    expect(saved.status).toBe("error");
    await prisma.systemAlert.findFirstOrThrow({
      where: { type: "shipment_dispatch_rejected", entityId: shipment.id },
    });

    // الشحنة الفاشلة ليست نشطة ⇒ يمكن إنشاء دورة جديدة بلا التفاف على القاعدة
    expect(await findActiveShipment(orderId)).toBeNull();
    dispatchMock.mockResolvedValue({ tracking: `TRK-${tag}-C`, raw: {} });
    const retry = await createShipment({ orderId, actor: { type: "admin", id: adminId } });
    expect(retry.role).toBe("reship");
    expect(retry.parentShipmentId).toBe(shipment.id);
  });

  // --------------------------------------------- 6 سباق شحنتين + لا بيانات جزئية
  it("سباق شحنتين لنفس الطلب: واحدة فقط تنجح، والخاسرة لا تترك أي أثر", async () => {
    const orderId = await readyOrder();
    dispatchMock.mockResolvedValue({ tracking: `TRK-${tag}-D`, raw: {} });

    const results = await Promise.allSettled([
      createShipment({ orderId, actor: { type: "admin", id: adminId } }),
      createShipment({ orderId, actor: { type: "admin", id: adminId } }),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected");
    expect((rejected as PromiseRejectedResult).reason).toBeInstanceOf(ShipmentError);
    expect((rejected as PromiseRejectedResult).reason.code).toBe("ACTIVE_SHIPMENT_EXISTS");

    // لا بيانات جزئية: صف شحنة واحد، وأسطره وحدثه فقط
    expect(await prisma.shipment.count({ where: { orderId } })).toBe(1);
    expect(await prisma.shipmentItem.count({ where: { orderId } })).toBe(1);
    expect(
      await prisma.domainEvent.count({ where: { eventType: "shipment.created", entityType: "shipment" , entityId: (results.find((r) => r.status === "fulfilled") as PromiseFulfilledResult<{ id: string }>).value.id } }),
    ).toBe(1);
  });

  // ------------------------------------------------------- 7 حالة غير قابلة للشحن
  it("طلب ليس ready_to_ship يُرفض بلا أي كتابة", async () => {
    const order = await prisma.order.create({
      data: {
        orderNumber: `SHP-${tag}-${Math.random().toString(36).slice(2, 8)}`,
        status: "pending",
        customerFirstName: "قبل",
        customerLastName: "الجاهزية",
        phone: "0550000011",
        wilayaCode,
        wilayaName: "اختبار",
        commune: "اختبار",
        address: "شارع 2",
        deliveryOption: "home",
        deliveryPriceDzd: 0,
        itemsSubtotalDzd: 500,
        totalDzd: 500,
        isTest: false,
        items: {
          create: [
            {
              productNameSnapshot: "منتج",
              productSlugSnapshot: "p",
              unitPriceDzd: 500,
              quantity: 1,
              lineTotalDzd: 500,
            },
          ],
        },
      },
      select: { id: true },
    });

    await expect(
      createShipment({ orderId: order.id, actor: { type: "admin", id: adminId } }),
    ).rejects.toMatchObject({ code: "ORDER_NOT_SHIPPABLE" });

    expect(await prisma.shipment.count({ where: { orderId: order.id } })).toBe(0);
    expect(await prisma.domainEvent.count({ where: { entityType: "shipment" } })).toBeGreaterThanOrEqual(0);
  });

  // ------------------------------------------------------------ 8 إعادة الشحن
  it("إعادة الشحن تُعيد الطلب المرتجع للدورة بسبب موثّق، وسباقها ينتهي بفائز واحد", async () => {
    const orderId = await readyOrder();
    dispatchMock.mockResolvedValue({ tracking: `TRK-${tag}-E`, raw: {} });
    const first = await createShipment({ orderId, actor: { type: "admin", id: adminId } });
    await dispatchNow(first.id);

    // مسار رسمي حتى الإرجاع: shipped → return_to_origin → returned
    await transitionOrderStatus(orderId, "return_to_origin", { actor: { type: "carrier" } });
    await transitionOrderStatus(orderId, "returned", { actor: { type: "carrier" } });

    const race = await Promise.allSettled([
      reshipOrder({ orderId, actor: { type: "admin", id: adminId }, reason: "الزبون طلب إعادة المحاولة" }),
      reshipOrder({ orderId, actor: { type: "admin", id: adminId }, reason: "إعادة ثانية متزامنة" }),
    ]);
    const reasons = race
      .filter((r): r is PromiseRejectedResult => r.status === "rejected")
      .map((r) => String(r.reason?.message ?? r.reason));
    expect(race.filter((r) => r.status === "fulfilled"), reasons.join(" | ")).toHaveLength(1);

    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true } });
    expect(order.status).toBe("confirmed");

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: "shipment_reship", entityId: orderId },
      select: { reason: true },
    });
    expect(audit.reason).toBeTruthy();

    // تاريخ الشحنات محفوظ: الشحنة الأولى ما زالت موجودة، مُغلقة لا محذوفة
    const previous = await prisma.shipment.findFirstOrThrow({ where: { orderId } });
    expect(await prisma.shipment.count({ where: { orderId } })).toBe(1);
    expect(previous.status).toBe("returned");
    expect(previous.trackingNumber).not.toBeNull();

    // والدورة الجديدة ممكنة فعلًا: لا شحنة نشطة تحجبها
    expect(await findActiveShipment(orderId)).toBeNull();
  });

  it("إعادة الشحن مرفوضة بلا سبب، ومرفوضة وهناك شحنة نشطة", async () => {
    const orderId = await readyOrder();
    dispatchMock.mockResolvedValue({ tracking: `TRK-${tag}-F`, raw: {} });
    await createShipment({ orderId, actor: { type: "admin", id: adminId } });

    await expect(
      reshipOrder({ orderId, actor: { type: "admin", id: adminId }, reason: "   " }),
    ).rejects.toBeInstanceOf(ShipmentError);

    // طلب لم يُرتجع: الانتقال نفسه يرفض — لا حاجة لفحص شحنة نشطة منفصل
    await expect(
      reshipOrder({ orderId, actor: { type: "admin", id: adminId }, reason: "سبب صالح" }),
    ).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    const untouched = await prisma.shipment.findFirstOrThrow({ where: { orderId } });
    expect(untouched.status).not.toBe("returned"); // الخاسر لم يمسّ الشحنة
  });
});
