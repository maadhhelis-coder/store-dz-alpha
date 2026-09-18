import { test, expect } from "./support/fixtures";
import { testPrisma } from "./support/testPrisma";
import { E2E_OWNER_EMAIL } from "./support/adminFixtures";
import { e2eLastName, e2ePhone } from "./support/testData";
import { getActiveWilaya, createTestProduct } from "./support/seedFixtures";

// التدقيق النهائي من طرف إلى طرف: تعديل الطلب/حالته عبر HTTP بجلسة المالك يُوثَّق باسمه،
// phone_normalized يتبع الهاتف، وردود API المصادَق عليها بلا تخزين مؤقت.

test.describe("التدقيق النهائي — الفاعل والتخزين المؤقت @desktop-only", () => {
  test("PATCH الطلب/الحالة بجلسة المالك: فاعل admin في التدقيق وسجل الحالات؛ Cache-Control private", async ({ ownerPage }) => {
    const wilaya = await getActiveWilaya();
    const product = await createTestProduct({ inventoryCount: 3 });
    const owner = await testPrisma.adminUser.findUniqueOrThrow({ where: { email: E2E_OWNER_EMAIL }, select: { id: true } });
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
        items: { create: [{ productId: product.id, productNameSnapshot: "منتج", productSlugSnapshot: product.slug, unitPriceDzd: 2000, quantity: 1, lineTotalDzd: 2000 }] },
      },
    });
    const r = ownerPage.request;

    const list = await r.get("/api/admin/orders?pageSize=1");
    expect(list.status()).toBe(200);
    expect(list.headers()["cache-control"]).toBe("private, no-store");

    const newPhone = e2ePhone();
    expect((await r.patch(`/api/admin/orders/${order.id}`, { data: { phone: newPhone, notes: "e2e" } })).status()).toBe(200);
    const after = await testPrisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(after.phoneNormalized).toBe(newPhone);
    const audit = await testPrisma.auditLog.findFirst({ where: { action: "order.update", entityId: order.id }, orderBy: { createdAt: "desc" } });
    expect(audit?.actorType).toBe("admin");
    expect(audit?.actorId).toBe(owner.id);
    expect(JSON.stringify(audit?.after)).not.toContain(newPhone);

    expect((await r.patch(`/api/admin/orders/${order.id}/status`, { data: { status: "confirmed" } })).status()).toBe(200);
    const history = await testPrisma.orderStatusHistory.findFirst({ where: { orderId: order.id, newStatus: "confirmed" }, orderBy: { createdAt: "desc" } });
    expect(history?.actorType).toBe("admin");
    expect(history?.actorId).toBe(owner.id);
  });
});
