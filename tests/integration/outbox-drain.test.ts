import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { drainOutbox, outboxHealth } from "@/server/modules/automation/outboxDrainer";
import { transitionOrderStatus } from "@/server/modules/orders/statusService";
import { ensureWilayaCode, newTag, type FixtureTag } from "./support/customerFixtures";

// تصريف صندوق الأحداث — كان المشغّل مكتوبًا بلا أي مستدعٍ، فالأحداث تُكتب
// وتبقى pending إلى الأبد. هذه الاختبارات تثبت أن المسار يصرّف فعليًا، وأن
// التصريف آمن للتكرار والتزامن (لا معالجة مزدوجة).

const maybeDescribe = process.env.TEST_DATABASE_URL ? describe : describe.skip;

maybeDescribe("تصريف صندوق الأحداث (integration)", () => {
  let tag: FixtureTag;
  let wilayaCode: number;

  beforeAll(async () => {
    tag = newTag("outbox");
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

  async function orderWithPendingEvent() {
    const order = await prisma.order.create({
      data: {
        orderNumber: `OB-${tag}-${Math.random().toString(36).slice(2, 8)}`,
        status: "pending",
        customerFirstName: "صندوق",
        customerLastName: "أحداث",
        phone: "0550000008",
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
    // انتقال حقيقي عبر الخدمة الموحّدة ⇒ يكتب حدث outbox داخل نفس المعاملة
    await transitionOrderStatus(order.id, "confirmed", { actor: { type: "system" } });
    return order.id;
  }

  it("الحدث يُكتب pending ثم يصرّفه المشغّل إلى processed", async () => {
    const orderId = await orderWithPendingEvent();

    const before = await prisma.domainEvent.findFirstOrThrow({
      where: { entityId: orderId, eventType: "order.status_changed" },
      select: { id: true, status: true, processedAt: true },
    });
    expect(before.status).toBe("pending");
    expect(before.processedAt).toBeNull();

    const result = await drainOutbox();
    expect(result.processed).toBeGreaterThanOrEqual(1);
    expect(result.failed).toBe(0);

    const after = await prisma.domainEvent.findUniqueOrThrow({
      where: { id: before.id },
      select: { status: true, processedAt: true, lastError: true },
    });
    expect(after.status).toBe("processed");
    expect(after.processedAt).not.toBeNull();
    expect(after.lastError).toBeNull();
  });

  it("تصريف متكرر لا يعيد معالجة ما عولج (آمن للتكرار)", async () => {
    await orderWithPendingEvent();
    const first = await drainOutbox();
    expect(first.processed).toBeGreaterThanOrEqual(1);

    const second = await drainOutbox();
    expect(second.processed).toBe(0);
    expect(second.failed).toBe(0);
  });

  it("تصريفان متزامنان: كل حدث يُطالَب مرة واحدة فقط (قفل lease)", async () => {
    const ids = [await orderWithPendingEvent(), await orderWithPendingEvent()];

    const [a, b] = await Promise.all([drainOutbox(), drainOutbox()]);
    // مجموع ما عولج لا يتجاوز عدد الأحداث المعلقة — لا معالجة مزدوجة
    expect(a.processed + b.processed).toBeLessThanOrEqual(ids.length);
    expect(a.failed + b.failed).toBe(0);

    const stuck = await prisma.domainEvent.count({
      where: { entityId: { in: ids }, status: { in: ["pending", "processing"] } },
    });
    expect(stuck).toBe(0);
  });

  it("صحة الصندوق تُبلَّغ بأرقام حقيقية", async () => {
    const health = await outboxHealth();
    expect(typeof health.pending).toBe("number");
    expect(typeof health.deadLetters).toBe("number");
    expect(health.pending).toBeGreaterThanOrEqual(0);
  });
});
