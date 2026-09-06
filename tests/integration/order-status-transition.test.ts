import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { transitionOrderStatus } from "@/server/modules/orders/statusService";
import { ensureWilayaCode, newTag, type FixtureTag } from "./support/customerFixtures";

// انتقال حالة الطلب — الاختبار الذي كان مفقودًا.
//
// العيب المكتشف: statusTimestampFields كانت تُرجع الطوابع الزمنية فقط بلا الحقل
// status، فكان updateMany يطابق الصف ويكتب الطوابع دون تغيير الحالة، بينما
// تُكتب order_status_history وaudit وحدث outbox مدّعية أن الحالة تغيّرت،
// وfinalizeStatusSideEffects يخرج مبكرًا (existing.status === updated.status)
// فلا يُرسل webhook ولا أحداث التحويل الإعلاني. أي: كل تغيير حالة كان بلا أثر
// على العمود نفسه، مع سجلّ يقول العكس.

const maybeDescribe = process.env.TEST_DATABASE_URL ? describe : describe.skip;

maybeDescribe("انتقال حالة الطلب (integration)", () => {
  let tag: FixtureTag;
  let wilayaCode: number;

  beforeAll(async () => {
    tag = newTag("status");
    wilayaCode = await ensureWilayaCode();
  });

  afterAll(async () => {
    const orders = await prisma.order.findMany({
      where: { orderNumber: { contains: tag } },
      select: { id: true },
    });
    const ids = orders.map((o) => o.id);
    await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.domainEvent.deleteMany({ where: { entityId: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { entityId: { in: ids } } });
    await prisma.order.deleteMany({ where: { id: { in: ids } } });
  });

  async function createPendingOrder() {
    return prisma.order.create({
      data: {
        orderNumber: `ST-${tag}-${Math.random().toString(36).slice(2, 8)}`,
        status: "pending",
        customerFirstName: "انتقال",
        customerLastName: "حالة",
        phone: "0550000009",
        wilayaCode,
        wilayaName: "اختبار",
        commune: "اختبار",
        deliveryOption: "home",
        deliveryPriceDzd: 0,
        itemsSubtotalDzd: 1000,
        totalDzd: 1000,
        isTest: false,
      },
      select: { id: true, status: true },
    });
  }

  it("pending → confirmed يغيّر العمود status فعليًا لا الطوابع وحدها", async () => {
    const order = await createPendingOrder();

    const returned = await transitionOrderStatus(order.id, "confirmed", {
      actor: { type: "admin", id: null },
      reason: "اختبار انتقال",
    });

    // ما تُرجعه الدالة يجب أن يطابق ما في القاعدة — لا ادعاء بلا كتابة
    expect(returned.status).toBe("confirmed");
    const row = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      select: { status: true, confirmedAt: true },
    });
    expect(row.status).toBe("confirmed");
    expect(row.confirmedAt).not.toBeNull();
  });

  it("السجل التاريخي يطابق الحقيقة (لا سجل لتغيير لم يقع)", async () => {
    const order = await createPendingOrder();
    await transitionOrderStatus(order.id, "confirmed", { actor: { type: "system" } });

    const history = await prisma.orderStatusHistory.findMany({
      where: { orderId: order.id },
      select: { oldStatus: true, newStatus: true },
    });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ oldStatus: "pending", newStatus: "confirmed" });

    const current = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      select: { status: true },
    });
    // الحالة الفعلية = ما يقوله آخر سجل
    expect(current.status).toBe(history[0].newStatus);
  });

  it("سلسلة انتقالات مشروعة تصل فعليًا إلى delivered بطوابعها", async () => {
    const order = await createPendingOrder();
    for (const next of ["confirmed", "preparing", "ready_to_ship", "shipped", "delivered"] as const) {
      await transitionOrderStatus(order.id, next, { actor: { type: "system" } });
    }

    const row = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      select: { status: true, confirmedAt: true, deliveredAt: true },
    });
    expect(row.status).toBe("delivered");
    expect(row.confirmedAt).not.toBeNull();
    expect(row.deliveredAt).not.toBeNull();
  });

  it("انتقال غير مشروع يُرفض ولا يغيّر شيئًا", async () => {
    const order = await createPendingOrder();
    await expect(
      transitionOrderStatus(order.id, "delivered", { actor: { type: "system" } }),
    ).rejects.toThrow();

    const row = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      select: { status: true, deliveredAt: true },
    });
    expect(row.status).toBe("pending");
    expect(row.deliveredAt).toBeNull();
    expect(await prisma.orderStatusHistory.count({ where: { orderId: order.id } })).toBe(0);
  });
});
