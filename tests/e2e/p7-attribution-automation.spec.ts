import { test, expect, chooseHomeDelivery, selectOrderWilaya } from "./support/fixtures";
import { testPrisma } from "./support/testPrisma";
import { e2eLastName, e2ePhone } from "./support/testData";
import { getActiveWilaya, createTestProduct } from "./support/seedFixtures";

// P7 من طرف إلى طرف: إعلان (utm) → زيارة ثانية بعزو مختلف → طلب COD حقيقي من الواجهة →
// first-touch محفوظة وlast-touch في الطلب → حدث outbox عولج (نبضة after) → لوحة الأتمتة
// → التواصل (رابط واتساب manual، مزوّد غير متاح = failed صريح، طلب اختبار مرفوض) → RBAC.

test.describe("P7 — العزو والأتمتة والتواصل @desktop-only", () => {
  test("عزو أول/آخر لمسة محفوظ مع الطلب، والحدث عولج، ويظهر في صفحة الطلب ولوحة الأتمتة", async ({ page, ownerPage }) => {
    const wilaya = await getActiveWilaya();
    const product = await createTestProduct({ inventoryCount: 10, priceDzd: 2500 });

    // اللمسة الأولى: إعلان فيسبوك؛ الثانية: تيك توك (تصبح last ولا تدهس first)
    await page.goto(`/products/${product.slug}?utm_source=fb&utm_campaign=camp-first&utm_content=creative-a&campaign_id=111`);
    await expect(page.getByTestId("order-now-button").first()).toBeVisible();
    await page.goto(`/products/${product.slug}?utm_source=tiktok&utm_campaign=camp-last&utm_content=creative-b`);
    await expect(page.getByTestId("order-now-button").first()).toBeVisible();
    await expect
      .poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem("sdz_attr") ?? "null")?.last?.utmCampaign ?? null))
      .toBe("camp-last");
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("sdz_attr") ?? "null"));
    expect(stored.first.utmCampaign).toBe("camp-first");

    const lastName = e2eLastName();
    await page.getByTestId("order-full-name").fill(`زبون ${lastName}`);
    await page.getByTestId("order-phone").fill(e2ePhone());
    await selectOrderWilaya(page, wilaya.code);
    await page.getByTestId("order-commune").fill("بلدية اختبار").catch(() => {});
    const communeEl = page.getByTestId("order-commune");
    if ((await communeEl.evaluate((el) => el.tagName)) === "SELECT") await communeEl.selectOption({ index: 1 });
    await chooseHomeDelivery(page);
    await page.getByTestId("order-submit").evaluate((el) => el.scrollIntoView({ block: "center" }));
    await page.getByTestId("order-submit").click();
    await expect(page.getByTestId("order-success")).toBeVisible({ timeout: 15_000 });
    const orderNumber = (await page.getByTestId("order-number").textContent())!.trim();

    const order = await testPrisma.order.findFirstOrThrow({ where: { orderNumber } });
    expect(order.platform).toBe("tiktok");
    expect(order.creativeName).toBe("creative-b");
    expect(order.utmCampaign).toBe("camp-last");
    expect(order.landingPath).toBe(`/products/${product.slug}`);
    expect(order.firstTouchPlatform).toBe("facebook");
    expect(order.firstTouchUtmSource).toBe("fb");
    expect(order.firstTouchUtmCampaign).toBe("camp-first");
    expect(order.campaignId).toBeNull(); // آخر لمسة بلا campaign_id — لا يُنقل من الأولى

    // الحدث المعاملاتي عولج بنبضة after (المعالِجات مسجَّلة — الشيت يُتخطّى في E2E)
    await expect
      .poll(
        async () => (await testPrisma.domainEvent.findFirst({ where: { eventType: "order.created", entityId: order.id } }))?.status,
        { timeout: 20_000 },
      )
      .toBe("processed");
    const run = await testPrisma.automationRun.findFirst({
      where: { handler: "order.created:sheets-sync", event: { entityId: order.id } },
    });
    expect(run?.status).toBe("success");

    await ownerPage.goto(`/admin/orders/${order.id}`);
    await expect(ownerPage.getByTestId("attribution-panel")).toBeVisible();
    await expect(ownerPage.getByTestId("attr-utm_campaign")).toHaveText("camp-last");
    await expect(ownerPage.getByTestId("first-utm_campaign")).toHaveText("camp-first");
    await expect(ownerPage.getByTestId("communications-panel")).toBeVisible();

    await ownerPage.goto("/admin/automation?status=processed");
    await expect(ownerPage.getByTestId("events-table")).toContainText(order.id.slice(0, 8));
    await expect(ownerPage.getByTestId("outbox-health")).toBeVisible();
  });

  test("التواصل: رابط واتساب manual ثم تأكيد يدوي؛ SMS غير متاح = failed صريح؛ حدث مكرَّر = رسالة واحدة؛ طلب اختبار مرفوض", async ({ ownerPage }) => {
    const wilaya = await getActiveWilaya();
    const product = await createTestProduct({ inventoryCount: 3 });
    const order = await testPrisma.order.create({
      data: {
        orderNumber: `SD-E2E-${Date.now().toString(36)}`,
        status: "pending",
        customerFirstName: "زبون",
        customerLastName: e2eLastName(),
        phone: e2ePhone(),
        wilayaCode: wilaya.code,
        wilayaName: "ولاية اختبار",
        commune: "بلدية اختبار",
        deliveryOption: "home",
        deliveryPriceDzd: 500,
        itemsSubtotalDzd: 2000,
        totalDzd: 2500,
        isTest: false,
        items: {
          create: [
            { productId: product.id, productNameSnapshot: "منتج", productSlugSnapshot: product.slug, unitPriceDzd: 2000, quantity: 1, lineTotalDzd: 2000 },
          ],
        },
      },
    });
    const r = ownerPage.request;

    const link = await r.post("/api/admin/crm/communications", {
      data: { orderId: order.id, provider: "whatsapp_deeplink", template: "order_confirmed" },
    });
    expect(link.status()).toBe(201);
    const queued = await link.json();
    expect(queued.status).toBe("queued");
    const row = await testPrisma.communication.findUniqueOrThrow({ where: { id: queued.id } });
    expect((row.providerResponse as { url?: string }).url).toContain("wa.me/213");

    // من الواجهة: زر «أُرسلت ✓» يُغلق الرسالة كـsent (تأكيد بشري لا ادّعاء آلي)
    await ownerPage.goto(`/admin/orders/${order.id}`);
    await expect(ownerPage.getByTestId(`comm-link-${row.id}`)).toBeVisible();
    await ownerPage.getByTestId(`comm-mark-sent-${row.id}`).click();
    await expect(ownerPage.getByTestId(`comm-status-${row.id}`)).toHaveText("أُرسلت");

    const sms = await r.post("/api/admin/crm/communications", {
      data: { orderId: order.id, provider: "sms", template: "order_shipped" },
    });
    expect(sms.status()).toBe(201);
    const smsRow = await testPrisma.communication.findUniqueOrThrow({ where: { id: (await sms.json()).id } });
    expect(smsRow.status).toBe("failed");
    expect(smsRow.error).toContain("provider_unavailable");
    // الإعادة اليدوية لمزوّد غير متاح تبقى failed (لا إرسال وهمي) وتُوثَّق
    expect((await r.post(`/api/admin/crm/communications/${smsRow.id}/retry`, { data: { reason: "تجربة" } })).status()).toBe(200);
    expect((await testPrisma.communication.findUniqueOrThrow({ where: { id: smsRow.id } })).status).toBe("failed");
    expect(await testPrisma.auditLog.count({ where: { action: "communication_retry", entityId: smsRow.id } })).toBe(1);

    // تفعيل رسائل الزبون: انتقال الحالة عبر HTTP → حدث → رسالة آلية واحدة (مفتاح دائم)
    await testPrisma.crmSetting.upsert({
      where: { key: "automation_enabled" },
      create: { key: "automation_enabled", value: { "order.status_changed:notify-customer": true } },
      update: { value: { "order.status_changed:notify-customer": true } },
    });
    const dedupeKey = `order:${order.id}:status:confirmed`;
    try {
      expect((await r.patch(`/api/admin/orders/${order.id}/status`, { data: { status: "confirmed" } })).status()).toBe(200);
      await expect
        .poll(async () => testPrisma.communication.count({ where: { orderId: order.id, dedupeKey } }), { timeout: 20_000 })
        .toBe(1);
      // حدث مكرَّر (إعادة تشغيلة) + تصريف عبر نبضة انتقال حالة آخر (preparing بلا قالب) — لا رسالة ثانية
      await testPrisma.domainEvent.create({
        data: {
          eventType: "order.status_changed",
          entityType: "order",
          entityId: order.id,
          payload: { orderNumber: order.orderNumber, from: "pending", to: "confirmed" },
          actorType: "system",
        },
      });
      expect((await r.patch(`/api/admin/orders/${order.id}/status`, { data: { status: "preparing" } })).status()).toBe(200);
      await expect
        .poll(
          async () => testPrisma.domainEvent.count({ where: { entityId: order.id, eventType: "order.status_changed", status: "pending" } }),
          { timeout: 20_000 },
        )
        .toBe(0);
      expect(await testPrisma.communication.count({ where: { orderId: order.id, dedupeKey } })).toBe(1);
    } finally {
      await testPrisma.crmSetting.deleteMany({ where: { key: "automation_enabled" } });
    }

    // طلب اختبار: مرفوض على مستوى الخدمة
    await testPrisma.order.update({ where: { id: order.id }, data: { isTest: true } });
    const testSend = await r.post("/api/admin/crm/communications", {
      data: { orderId: order.id, provider: "whatsapp_deeplink", template: "order_confirmed" },
    });
    expect(testSend.status()).toBe(409);
  });

  test("RBAC: بلا جلسة 401؛ packing_agent 403 على الأتمتة والتواصل؛ viewer يقرأ الأتمتة ولا يعيد", async ({ page, staffPage }) => {
    expect((await page.request.get("/api/admin/crm/automation")).status()).toBe(401);
    const staff = await testPrisma.adminUser.findFirstOrThrow({
      where: { email: { contains: "e2e-staff" } },
      select: { id: true, role: true },
    });
    const fake = "00000000-0000-4000-8000-0000000000ff";
    try {
      await testPrisma.adminUser.update({ where: { id: staff.id }, data: { role: "packing_agent" } });
      const r = staffPage.request;
      expect((await r.get("/api/admin/crm/automation")).status()).toBe(403);
      expect((await r.get("/api/admin/crm/communications")).status()).toBe(403);
      expect((await r.post("/api/admin/crm/communications", { data: {} })).status()).toBe(403);
      expect((await r.post(`/api/admin/crm/automation/${fake}/retry`, { data: { reason: "x" } })).status()).toBe(403);

      await testPrisma.adminUser.update({ where: { id: staff.id }, data: { role: "viewer" } });
      expect((await r.get("/api/admin/crm/automation")).status()).toBe(200);
      expect((await r.get("/api/admin/crm/communications")).status()).toBe(200);
      expect((await r.post(`/api/admin/crm/automation/${fake}/retry`, { data: { reason: "x" } })).status()).toBe(403);
      expect((await r.post("/api/admin/crm/communications", { data: {} })).status()).toBe(403);
    } finally {
      await testPrisma.adminUser.update({ where: { id: staff.id }, data: { role: staff.role } });
    }
  });
});
