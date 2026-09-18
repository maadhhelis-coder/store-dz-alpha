import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/server/db/prisma";
import { drainOutboxUntilEmpty } from "@/server/modules/automation/outboxDrainer";
import { retryDomainEvent } from "@/server/modules/automation/automationService";
import { createOutboxEvent, transitionOrderStatus } from "@/server/modules/orders/statusService";
import { createOrder } from "@/server/services/ordersService";
import {
  cancelCommunication,
  dispatchCommunication,
  queueCommunication,
  MAX_RETRIES,
} from "@/server/modules/communications/communicationService";
import { NOTIFY_CUSTOMER_HANDLER, SHEETS_CREATED_HANDLER } from "@/server/modules/automation/handlers";
import { parseTouchFromParams } from "@/lib/attribution";
import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/rbac/permissions";
import { createAdmin, ensureWilayaCode, newTag, type FixtureTag } from "./support/customerFixtures";

// P7 على قاعدة حقيقية: لقطة العزو عند الإنشاء، outbox → Sheets (fetch مُقلَّد) مع
// idempotency وretry وdead-letter وإعادة يدوية، التواصل بمفتاح دائم + تزامن + مزوّد غير
// متاح، استثناء isTest، وزرع RBAC. الناقل مُقلَّد كي لا يُرسل حدث الشحن شيئًا.

vi.mock("@/server/services/dhdService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/services/dhdService")>();
  return { ...actual, createDhdShipment: vi.fn(), fetchDhdOrderStatus: vi.fn(), getDhdCommunes: vi.fn(async () => []) };
});

const maybeDescribe = process.env.TEST_DATABASE_URL ? describe : describe.skip;

maybeDescribe("P7 — العزو والأتمتة والتواصل (integration)", () => {
  let tag: FixtureTag;
  let adminId: string;
  let wilayaCode: number;
  let productSlug: string;
  let categoryId: string;
  let productId: string;
  const orderIds: string[] = [];
  const realFetch = global.fetch;

  beforeAll(async () => {
    tag = newTag("p7");
    wilayaCode = await ensureWilayaCode();
    adminId = await createAdmin(tag);
    const category = await prisma.category.create({
      data: { slug: `cat-${tag}`, name: `تصنيف ${tag}`, shortDescription: "x", description: "x" },
      select: { id: true },
    });
    categoryId = category.id;
    productSlug = `prod-${tag}`;
    const product = await prisma.product.create({
      data: {
        slug: productSlug,
        name: `منتج ${tag}`,
        categoryId,
        priceDzd: 1_500,
        costDzd: 500,
        shortDescription: "x",
        longDescriptionHtml: "<p>x</p>",
        inventoryCount: 100,
      },
      select: { id: true },
    });
    productId = product.id;
    await prisma.crmSetting.upsert({
      where: { key: "automation_enabled" },
      create: { key: "automation_enabled", value: { [NOTIFY_CUSTOMER_HANDLER]: true } },
      update: { value: { [NOTIFY_CUSTOMER_HANDLER]: true } },
    });
    await drainOutboxUntilEmpty(100);
  });

  afterEach(() => {
    global.fetch = realFetch;
    delete process.env.ORDER_SHEETS_ENDPOINT;
  });

  afterAll(async () => {
    await prisma.crmSetting.deleteMany({ where: { key: "automation_enabled" } });
    const ids = orderIds;
    await prisma.communication.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.shipmentItem.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.shipment.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.automationRun.deleteMany({ where: { event: { entityId: { in: ids } } } });
    await prisma.domainEvent.deleteMany({ where: { entityId: { in: ids } } });
    await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.task.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { entityId: { in: ids } } });
    await prisma.order.deleteMany({ where: { id: { in: ids } } });
    await prisma.customerPhone.deleteMany({ where: { customer: { fullName: { contains: tag } } } });
    await prisma.customerSegment.deleteMany({ where: { customer: { fullName: { contains: tag } } } });
    await prisma.customer.deleteMany({ where: { fullName: { contains: tag } } });
    await prisma.integrationSyncLog.deleteMany({
      where: { integration: "google_sheets", startedAt: { gte: new Date(Date.now() - 3_600_000) } },
    });
    await prisma.systemAlert.deleteMany({
      where: {
        OR: [{ type: "dead_letter_accumulation" }, { type: "communication_failed" }],
        createdAt: { gte: new Date(Date.now() - 3_600_000) },
      },
    });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.adminUser.deleteMany({ where: { id: adminId } });
  });

  const T0 = new Date("2026-09-01T00:00:00Z");
  const snapshot = () => ({
    first: parseTouchFromParams(
      new URLSearchParams("utm_source=fb&utm_campaign=c1&utm_content=cr1&campaign_id=111"),
      "/products/x",
      T0,
    )!,
    last: parseTouchFromParams(
      new URLSearchParams("utm_source=tiktok&utm_campaign=c2&utm_content=cr2"),
      "/l/y",
      new Date(T0.getTime() + 3_600_000),
    )!,
  });

  async function newOrder(extra: Record<string, unknown> = {}) {
    const order = await createOrder(
      {
        firstName: "عزو",
        lastName: tag,
        phone: `05${Math.floor(10_000_000 + Math.random() * 89_999_999)}`,
        wilayaCode,
        commune: "اختبار",
        deliveryOption: "home",
        productSlug,
        quantity: 1,
        attribution: snapshot(),
        ...extra,
      },
      {},
    );
    orderIds.push(order.id);
    return order;
  }

  /** fetch مُقلَّد لنقطة Apps Script — يعدّ النداءات ويُرجع رد النسخة 3 */
  function mockSheets(responder: () => Promise<Response> | Response) {
    process.env.ORDER_SHEETS_ENDPOINT = `https://script.google.com/macros/s/${tag}/exec`;
    const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("script.google.com")) return responder();
      return realFetch(input, init);
    });
    global.fetch = spy as typeof fetch;
    return spy;
  }
  const okJson = () => new Response(JSON.stringify({ status: "ok" }), { status: 200 });
  const bodyOf = (c: unknown[]) => JSON.parse(String((c[1] as RequestInit | undefined)?.body));

  // ------------------------------------------------------------ العزو
  it("إنشاء الطلب يحفظ لقطة العزو: last-touch في الحقول وfirst-touch ثابتة، ولا تُعاد حسابها", async () => {
    const order = await newOrder();
    const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.platform).toBe("tiktok");
    expect(row.creativeName).toBe("cr2");
    expect(row.utmCampaign).toBe("c2");
    expect(row.landingPath).toBe("/l/y");
    expect(row.firstTouchPlatform).toBe("facebook");
    expect(row.firstTouchUtmSource).toBe("fb");
    expect(row.firstTouchUtmCampaign).toBe("c1");
    expect(row.campaignId).toBeNull(); // آخر لمسة بلا campaign_id — لا تخمين من الأولى
    // بلا لقطة: الحقول تبقى فارغة (حالة غير متاحة صريحة)
    const bare = await createOrder(
      { firstName: "بلا", lastName: tag, phone: "0551112233", wilayaCode, commune: "اختبار", deliveryOption: "home", productSlug, quantity: 1 },
      {},
    );
    orderIds.push(bare.id);
    const bareRow = await prisma.order.findUniqueOrThrow({ where: { id: bare.id } });
    expect(bareRow.utmSource).toBeNull();
    expect(bareRow.firstTouchPlatform).toBeNull();
  });

  // ------------------------------------------------------------ outbox → Sheets
  it("order.created → outbox → Sheets مرة واحدة (idempotent عبر automation_runs)، وسجل مزامنة ناجح", async () => {
    const spy = mockSheets(okJson);
    const order = await newOrder();
    await drainOutboxUntilEmpty(20);
    const calls = () => spy.mock.calls.filter((c) => bodyOf(c).orderNumber === order.orderNumber);
    expect(calls()).toHaveLength(1);
    expect(bodyOf(calls()[0]).action).toBe("order.created");
    const run = await prisma.automationRun.findFirstOrThrow({
      where: { handler: SHEETS_CREATED_HANDLER, event: { entityId: order.id } },
    });
    expect(run.status).toBe("success");
    const log = await prisma.integrationSyncLog.findFirst({
      where: { integration: "google_sheets", stats: { path: ["orderNumber"], equals: order.orderNumber } },
      orderBy: { startedAt: "desc" },
    });
    expect(log?.status).toBe("success");
    // تصريف ثانٍ (تداخل نبضة + cron): لا نداء ثانٍ
    await drainOutboxUntilEmpty(5);
    expect(calls()).toHaveLength(1);
  });

  it("فشل Sheets: إعادة محاولة ثم dead-letter + SystemAlert، والإعادة اليدوية تنجح وتوثَّق", async () => {
    let fail = true;
    const spy = mockSheets(() => (fail ? new Response("<html>err</html>", { status: 500 }) : okJson()));
    const order = await newOrder();
    for (let i = 0; i < 5; i++) await drainOutboxUntilEmpty(5);
    const event = await prisma.domainEvent.findFirstOrThrow({ where: { eventType: "order.created", entityId: order.id } });
    expect(event.status).toBe("failed");
    expect(event.attempts).toBeGreaterThanOrEqual(3);
    expect(await prisma.systemAlert.count({ where: { type: "dead_letter_accumulation", entityId: event.id } })).toBe(1);
    expect(
      await prisma.integrationSyncLog.count({
        where: { integration: "google_sheets", status: "failed", stats: { path: ["orderNumber"], equals: order.orderNumber } },
      }),
    ).toBeGreaterThanOrEqual(3);

    fail = false;
    await retryDomainEvent(event.id, { type: "admin", id: adminId }, "الشيت عاد للعمل");
    await drainOutboxUntilEmpty(5);
    const after = await prisma.domainEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(after.status).toBe("processed");
    expect(await prisma.auditLog.count({ where: { action: "automation_retry", entityId: event.id } })).toBe(1);
    expect(spy.mock.calls.filter((c) => bodyOf(c).orderNumber === order.orderNumber).length).toBeGreaterThanOrEqual(4);
  });

  it("طلب اختبار: لا مزامنة ولا رسائل (على مستوى المعالِج والخدمة)", async () => {
    const spy = mockSheets(okJson);
    const order = await newOrder();
    // قيد القاعدة: طلب اختبار لا يُربط بعميل (orders_is_test_no_customer_check)
    await prisma.order.update({
      where: { id: order.id },
      data: { isTest: true, customerId: null, matchedPhoneId: null, customerMatchSource: null },
    });
    await drainOutboxUntilEmpty(20);
    expect(spy.mock.calls.some((c) => bodyOf(c).orderNumber === order.orderNumber)).toBe(false);
    await expect(
      queueCommunication({
        orderId: order.id,
        channel: "whatsapp",
        provider: "whatsapp_deeplink",
        template: "order_confirmed",
        actor: { type: "system" },
      }),
    ).rejects.toMatchObject({ code: "TEST_ORDER" });
  });

  // ------------------------------------------------------------ التواصل
  it("الحدث → رسالة بمفتاح دائم: تكرار الحدث لا يُنتج رسالة ثانية؛ مزوّد غير مضبوط = failed صريح بلا إعادة", async () => {
    mockSheets(okJson);
    const order = await newOrder();
    await drainOutboxUntilEmpty(20);
    await transitionOrderStatus(order.id, "confirmed", { actor: { type: "admin", id: adminId } });
    await drainOutboxUntilEmpty(20);
    const comms = await prisma.communication.findMany({ where: { orderId: order.id } });
    expect(comms).toHaveLength(1);
    expect(comms[0].dedupeKey).toBe(`order:${order.id}:status:confirmed`);
    expect(comms[0].status).toBe("failed");
    expect(comms[0].error).toContain("provider_unavailable");
    expect(comms[0].retries).toBe(MAX_RETRIES);

    // حدث مكرَّر لنفس الانتقال (إعادة webhook/تشغيلة): لا رسالة جديدة
    await prisma.$transaction((tx) =>
      createOutboxEvent(tx, {
        eventType: "order.status_changed",
        entityType: "order",
        entityId: order.id,
        payload: { orderNumber: order.orderNumber, from: "pending", to: "confirmed" },
        actorType: "system",
      }),
    );
    await drainOutboxUntilEmpty(20);
    expect(await prisma.communication.count({ where: { orderId: order.id } })).toBe(1);

    // إدراج متزامن بنفس المفتاح: صف واحد
    const key = `manual:${order.id}:${tag}`;
    const input = { orderId: order.id, channel: "whatsapp" as const, provider: "whatsapp_deeplink", template: "order_shipped" as const, dedupeKey: key, actor: { type: "system" as const } };
    const both = await Promise.all([queueCommunication(input), queueCommunication(input)]);
    expect(both[0].communication.id).toBe(both[1].communication.id);
    expect(both.filter((b) => b.created)).toHaveLength(1);

    // إرسال متزامن لرسالة واحدة: claim واحد؛ رابط واتساب = manual يبقى queued بالرابط
    const [a, b] = await Promise.all([
      dispatchCommunication(both[0].communication.id),
      dispatchCommunication(both[0].communication.id),
    ]);
    expect([a, b].filter((r) => r.skipped === "claimed_elsewhere")).toHaveLength(1);
    const row = await prisma.communication.findUniqueOrThrow({ where: { id: both[0].communication.id } });
    expect(row.status).toBe("queued");
    expect((row.providerResponse as { url?: string }).url).toContain("wa.me/213");

    const cancelled = await cancelCommunication(row.id, { type: "admin", id: adminId }, "لا داعي");
    expect(cancelled.status).toBe("cancelled");
    expect(await prisma.auditLog.count({ where: { action: "communication_cancel", entityId: row.id } })).toBe(1);
  });

  // ------------------------------------------------------------ RBAC
  it("زرع automation.read/retry يطابق الكتالوج (deny by default)", async () => {
    const rows = await prisma.rolePermission.findMany({
      where: { permission: { in: ["automation.read", "automation.retry"] } },
    });
    const has = (role: string, p: string) => rows.some((r) => r.role === role && r.permission === p);
    for (const role of ["owner", "admin", "viewer", "accountant", "packing_agent", "logistics_agent"] as const) {
      const expected = DEFAULT_ROLE_PERMISSIONS[role] as readonly string[];
      expect(has(role, "automation.read"), role).toBe(expected.includes("automation.read"));
      expect(has(role, "automation.retry"), role).toBe(expected.includes("automation.retry"));
    }
    expect(has("viewer", "automation.retry")).toBe(false);
    expect(has("owner", "automation.retry")).toBe(true);
  });
});
