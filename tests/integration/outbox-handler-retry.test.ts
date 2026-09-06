import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { drainOutbox, registerHandler } from "@/server/modules/automation/outboxDrainer";
import { transitionOrderStatus } from "@/server/modules/orders/statusService";
import { ensureWilayaCode, newTag, type FixtureTag } from "./support/customerFixtures";

// نزاهة إعادة المحاولة في صندوق الأحداث (C-1) — شرط مسبق لكل أثر خارجي في P5.
//
// المشكلة المُثبتة هنا: بوابة الـidempotency كانت تُنشأ بحالة "success" **قبل**
// تنفيذ المعالِج. فشل المعالِج ⇒ تُحدَّث إلى "failed" ويُرمى الخطأ ⇒ الحدث يعود
// pending. في التصريف التالي ينتهك INSERT قيد UNIQUE(event_id, handler) ⇒
// البوابة null ⇒ `continue` ⇒ لا معالِج يعمل ⇒ الحدث يُعلَّم "processed".
// النتيجة: فشل عابر واحد = أثر خارجي لا يُنفَّذ أبدًا وبصمت.
//
// العقد الصحيح: النجاح السابق وحده يمنع إعادة التنفيذ.

const maybeDescribe = process.env.TEST_DATABASE_URL ? describe : describe.skip;

maybeDescribe("نزاهة إعادة محاولة معالِج الصندوق (integration)", () => {
  let tag: FixtureTag;
  let wilayaCode: number;

  // المعالِجات مسجَّلة على مستوى الوحدة ومشتركة بين ملفات الاختبار (عامل واحد)،
  // فكل معالِج هنا يتجاهل أي حدث لا يخص طلبه — لا يلمس اختبارات أخرى.
  const retryProbe = { orderId: "", calls: 0 };
  const successProbe = { orderId: "", calls: 0 };

  registerHandler("order.status_changed:p5-retry-probe", async (event) => {
    if (event.entityId !== retryProbe.orderId) return;
    retryProbe.calls += 1;
    if (retryProbe.calls === 1) throw new Error("فشل مُتعمَّد لإثبات إعادة المحاولة");
  });

  registerHandler("order.status_changed:p5-success-probe", async (event) => {
    if (event.entityId !== successProbe.orderId) return;
    successProbe.calls += 1;
  });

  beforeAll(async () => {
    tag = newTag("obretry");
    wilayaCode = await ensureWilayaCode();
  });

  afterAll(async () => {
    const orders = await prisma.order.findMany({
      where: { orderNumber: { contains: tag } },
      select: { id: true },
    });
    const ids = orders.map((o) => o.id);
    await prisma.automationRun.deleteMany({ where: { event: { entityId: { in: ids } } } });
    await prisma.domainEvent.deleteMany({ where: { entityId: { in: ids } } });
    await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { entityId: { in: ids } } });
    await prisma.order.deleteMany({ where: { id: { in: ids } } });
  });

  async function orderWithPendingEvent(): Promise<string> {
    const order = await prisma.order.create({
      data: {
        orderNumber: `OBR-${tag}-${Math.random().toString(36).slice(2, 8)}`,
        status: "pending",
        customerFirstName: "إعادة",
        customerLastName: "محاولة",
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
      select: { id: true },
    });
    await transitionOrderStatus(order.id, "confirmed", { actor: { type: "system" } });
    return order.id;
  }

  function eventOf(orderId: string) {
    return prisma.domainEvent.findFirstOrThrow({
      where: { entityId: orderId, eventType: "order.status_changed" },
      select: { id: true, status: true, processedAt: true, attempts: true, lastError: true },
    });
  }

  it("فشل المعالِج لا يفقد الحدث ولا يعلّمه processed — يبقى قابلًا لإعادة المحاولة", async () => {
    retryProbe.orderId = await orderWithPendingEvent();
    retryProbe.calls = 0;

    const first = await drainOutbox();
    expect(first.failed).toBeGreaterThanOrEqual(1);
    expect(retryProbe.calls).toBe(1);

    const afterFail = await eventOf(retryProbe.orderId);
    expect(afterFail.status).toBe("pending"); // لا processed قبل نجاح التنفيذ
    expect(afterFail.processedAt).toBeNull();
    expect(afterFail.lastError).toContain("فشل مُتعمَّد");

    const run = await prisma.automationRun.findFirstOrThrow({
      where: { eventId: afterFail.id, handler: "order.status_changed:p5-retry-probe" },
      select: { status: true, error: true },
    });
    expect(run.status).toBe("failed");
    expect(run.error).toContain("فشل مُتعمَّد");
  });

  it("إعادة المحاولة تنجح: سجل فاشل لا يمنع التنفيذ، والحدث يكتمل", async () => {
    // نفس الحدث من الاختبار السابق — لا نُنشئ حدثًا جديدًا
    await drainOutbox();

    expect(retryProbe.calls).toBe(2); // نُفِّذ فعليًا مرة ثانية

    const done = await eventOf(retryProbe.orderId);
    expect(done.status).toBe("processed");
    expect(done.processedAt).not.toBeNull();

    const run = await prisma.automationRun.findFirstOrThrow({
      where: { eventId: done.id, handler: "order.status_changed:p5-retry-probe" },
      select: { status: true, attempts: true, finishedAt: true },
    });
    expect(run.status).toBe("success");
    expect(run.attempts).toBeGreaterThanOrEqual(2);
    expect(run.finishedAt).not.toBeNull();
  });

  it("النجاح السابق يمنع إعادة التنفيذ — لا أثر خارجي مزدوج", async () => {
    successProbe.orderId = await orderWithPendingEvent();
    successProbe.calls = 0;

    await drainOutbox();
    expect(successProbe.calls).toBe(1);

    // تصريفات إضافية: الحدث معالَج، والبوابة ناجحة ⇒ لا تنفيذ ثانٍ إطلاقًا
    await drainOutbox();
    await drainOutbox();
    expect(successProbe.calls).toBe(1);

    const run = await prisma.automationRun.findFirstOrThrow({
      where: { event: { entityId: successProbe.orderId }, handler: "order.status_changed:p5-success-probe" },
      select: { status: true, attempts: true },
    });
    expect(run.status).toBe("success");
    expect(run.attempts).toBe(1);
  });
});
