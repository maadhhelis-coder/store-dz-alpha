import { test, expect } from "./support/fixtures";
import { testPrisma } from "./support/testPrisma";
import { e2eLastName, e2ePhone } from "./support/testData";
import { getActiveWilaya, createTestProduct } from "./support/seedFixtures";

// P6 من طرف إلى طرف عبر HTTP الحقيقي والصفحات الحقيقية: دورة إرجاع جزئية → استلام →
// استرجاع للمخزون (مرتين — الثانية بلا أثر) → تسوية COD بفرق وحلّه → تعديل مالي →
// لوحة الربحية → RBAC (دور بلا صلاحية مالية يُرفض بـ403).

async function seedDeliveredOrder(productId: string, wilayaCode: number, totalDzd = 4_500) {
  return testPrisma.order.create({
    data: {
      orderNumber: `SD-E2E-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      status: "delivered",
      deliveredAt: new Date(),
      customerFirstName: "زبون",
      customerLastName: e2eLastName(),
      phone: e2ePhone(),
      wilayaCode,
      wilayaName: "ولاية اختبار",
      commune: "بلدية اختبار",
      deliveryOption: "home",
      deliveryPriceDzd: 500,
      itemsSubtotalDzd: totalDzd - 500,
      totalDzd,
      isTest: false,
      items: {
        create: [
          {
            productId,
            productNameSnapshot: "منتج E2E",
            productSlugSnapshot: "e2e",
            unitPriceDzd: 2_000,
            unitCostDzd: 700,
            quantity: 2,
            lineTotalDzd: 4_000,
          },
        ],
      },
    },
    include: { items: true },
  });
}

test.describe("P6 — المرتجعات والمالية @desktop-only", () => {
  test("إرجاع جزئي → استلام → استرجاع idempotent → إعادة الشحن تخصم المُسترجَع فقط", async ({ ownerPage }) => {
    const wilaya = await getActiveWilaya();
    const product = await createTestProduct({ inventoryCount: 5, priceDzd: 2_000 });
    const order = await seedDeliveredOrder(product.id, wilaya.code);
    const r = ownerPage.request;

    // إنشاء دورة إرجاع جزئية (1 من 2)
    const created = await r.post("/api/admin/crm/returns", {
      data: { orderId: order.id, reason: "refused", items: [{ orderItemId: order.items[0].id, quantity: 1 }] },
    });
    expect(created.status()).toBe(201);
    const ret = await created.json();
    expect(ret.cycleNumber).toBe(1);

    // تجاوز الكمية عبر دورة ثانية مرفوض (409) — والدورة النشطة الواحدة أصلًا
    const dup = await r.post("/api/admin/crm/returns", {
      data: { orderId: order.id, reason: "refused", items: [{ orderItemId: order.items[0].id, quantity: 2 }] },
    });
    expect(dup.status()).toBe(409);

    // الاستلام: الطلب يصبح returned بلا استرجاع مخزون
    expect((await r.post(`/api/admin/crm/returns/${ret.id}/status`, { data: { status: "received" } })).status()).toBe(200);
    const afterReceive = await testPrisma.product.findUniqueOrThrow({ where: { id: product.id }, select: { inventoryCount: true } });
    expect(afterReceive.inventoryCount).toBe(5);
    expect((await testPrisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("returned");

    // الاسترجاع من صفحة الدورة (الواجهة الحقيقية) ثم تكراره عبر API — بلا أثر ثانٍ
    await ownerPage.goto(`/admin/returns/${ret.id}`);
    await expect(ownerPage.getByTestId("return-status")).toContainText("استُلمت");
    const input = ownerPage.getByTestId(`restock-input-${ret.items[0].id}`);
    await input.fill("1");
    await ownerPage.getByTestId("restock-submit").click();
    await expect(ownerPage.getByTestId(`restocked-${ret.items[0].id}`)).toHaveText("1");
    await expect(ownerPage.getByTestId("return-status")).toContainText("استُرجعت كاملًا");

    const again = await r.post(`/api/admin/crm/returns/${ret.id}/restock`, {
      data: { items: [{ returnItemId: ret.items[0].id, restockedQuantity: 1 }] },
    });
    expect(again.status()).toBe(200);
    expect((await again.json()).applied).toEqual([]);
    const decrease = await r.post(`/api/admin/crm/returns/${ret.id}/restock`, {
      data: { items: [{ returnItemId: ret.items[0].id, restockedQuantity: 0 }] },
    });
    expect(decrease.status()).toBe(409);
    const stock = await testPrisma.product.findUniqueOrThrow({ where: { id: product.id }, select: { inventoryCount: true } });
    expect(stock.inventoryCount).toBe(6);

    // إعادة الشحن: يُخصم المُسترجَع (1) فقط
    expect((await r.post(`/api/admin/orders/${order.id}/reship`, { data: { reason: "استبدال" } })).status()).toBe(200);
    const afterReship = await testPrisma.product.findUniqueOrThrow({ where: { id: product.id }, select: { inventoryCount: true } });
    expect(afterReship.inventoryCount).toBe(5);

    // قائمة المرتجعات تعرض الدورة
    await ownerPage.goto("/admin/returns");
    await expect(ownerPage.getByTestId("returns-table")).toContainText(ret.returnNumber);
  });

  test("تسوية COD: استيراد بفرق، إعادة استيراد بلا أثر، حل الفرق من الصفحة", async ({ ownerPage }) => {
    const wilaya = await getActiveWilaya();
    const product = await createTestProduct({ inventoryCount: 3 });
    const exact = await seedDeliveredOrder(product.id, wilaya.code, 4_500);
    const short = await seedDeliveredOrder(product.id, wilaya.code, 4_500);
    const r = ownerPage.request;
    const reference = `E2E-${Date.now().toString(36)}`;
    const body = {
      provider: "dhd",
      settlementDate: "2026-09-10",
      reference,
      lines: [
        { orderNumber: exact.orderNumber, collectedDzd: 4_500 },
        { orderNumber: short.orderNumber, collectedDzd: 4_000 },
      ],
    };
    const first = await r.post("/api/admin/crm/finance/settlements", { data: body });
    expect(first.status()).toBe(201);
    const imported = await first.json();
    expect(imported.matched).toBe(1);
    expect(imported.discrepancies).toBe(1);

    const replay = await r.post("/api/admin/crm/finance/settlements", { data: body });
    expect(replay.status()).toBe(200);
    expect((await replay.json()).replayed).toBe(true);

    const conflict = await r.post("/api/admin/crm/finance/settlements", {
      data: { ...body, lines: [{ orderNumber: exact.orderNumber, collectedDzd: 1 }] },
    });
    expect(conflict.status()).toBe(409);

    const collected = await testPrisma.order.findUniqueOrThrow({ where: { id: exact.id } });
    expect(collected.status).toBe("cod_collected");
    expect(collected.codCollectedAmountDzd).toBe(4_500);

    // حل الفرق من صفحة التسوية
    await ownerPage.goto(`/admin/finance/settlements/${imported.settlementId}`);
    await expect(ownerPage.getByTestId("settlement-status")).toContainText("بها فروق");
    const item = await testPrisma.codSettlementItem.findFirstOrThrow({
      where: { settlementId: imported.settlementId, state: "discrepancy" },
    });
    await ownerPage.getByTestId(`resolve-reason-${item.id}`).fill("رسوم الناقل");
    await ownerPage.getByTestId(`resolve-submit-${item.id}`).click();
    await expect(ownerPage.getByTestId(`item-state-${item.id}`)).toHaveText("محلول");
    await expect(ownerPage.getByTestId("settlement-status")).toContainText("محلولة");
  });

  test("تعديل مالي غير قابل للتغيير + لوحة الربحية تعرض أرقامًا من المحرك", async ({ ownerPage }) => {
    const wilaya = await getActiveWilaya();
    const product = await createTestProduct({ inventoryCount: 3 });
    const order = await seedDeliveredOrder(product.id, wilaya.code);
    const r = ownerPage.request;

    const created = await r.post("/api/admin/crm/finance/adjustments", {
      data: { orderId: order.id, type: "partial_refund", amountDzd: 300, direction: "debit", reason: "خصم بعد شكوى" },
    });
    expect(created.status()).toBe(201);
    const adj = await created.json();
    // لا PATCH/DELETE: السجل غير قابل للتغيير عبر الـAPI
    expect((await r.patch(`/api/admin/crm/finance/adjustments/${adj.id}`, { data: { amountDzd: 1 } })).status()).toBeGreaterThanOrEqual(404);
    const correction = await r.post("/api/admin/crm/finance/adjustments", {
      data: { orderId: order.id, type: "partial_refund", amountDzd: 300, direction: "credit", reason: "إلغاء الخصم", correctionOfId: adj.id },
    });
    expect(correction.status()).toBe(201);

    // صفحة الطلب: صافي الربح = 4000 + 500 − 1400 − 500 (ناقل تقديري) − 0 + (−300 + 300)
    await ownerPage.goto(`/admin/orders/${order.id}`);
    await expect(ownerPage.getByTestId("order-net-profit")).toContainText("2.600");
    await expect(ownerPage.getByTestId("returns-panel")).toBeVisible();

    // لوحة المالية
    await ownerPage.goto("/admin/finance");
    await expect(ownerPage.getByTestId("profit-kpis")).toBeVisible();
    await ownerPage.getByTestId("profit-dimension").selectOption("order");
    await expect(ownerPage.getByTestId("profit-rows")).toContainText(order.orderNumber);
    await ownerPage.goto("/admin/finance?tab=adjustments");
    await expect(ownerPage.getByTestId("adjustments-table")).toContainText(order.orderNumber);

    const api = await r.get("/api/admin/crm/finance/profitability?range=30d&dimension=order");
    expect(api.status()).toBe(200);
    const report = await api.json();
    expect(report.summary.allocationMethod).toBe("largest_remainder_v1");
    expect(report.rows.some((row: { key: string }) => row.key === order.id)).toBe(true);
  });

  test("RBAC: packing_agent يُرفض على كل مسارات المالية والمرتجعات الحساسة", async ({ staffPage }) => {
    const staff = await testPrisma.adminUser.findFirstOrThrow({
      where: { email: { contains: "e2e-staff" } },
      select: { id: true, role: true },
    });
    await testPrisma.adminUser.update({ where: { id: staff.id }, data: { role: "packing_agent" } });
    try {
      const r = staffPage.request;
      const fake = "00000000-0000-4000-8000-0000000000ff";
      const denied = {
        "GET /crm/returns": (await r.get("/api/admin/crm/returns")).status(),
        "POST /crm/returns": (await r.post("/api/admin/crm/returns", { data: { orderId: fake, reason: "refused", items: [] } })).status(),
        "POST restock": (await r.post(`/api/admin/crm/returns/${fake}/restock`, { data: { items: [] } })).status(),
        "GET settlements": (await r.get("/api/admin/crm/finance/settlements")).status(),
        "POST settlements": (await r.post("/api/admin/crm/finance/settlements", { data: {} })).status(),
        "POST adjustments": (await r.post("/api/admin/crm/finance/adjustments", { data: {} })).status(),
        "GET profitability": (await r.get("/api/admin/crm/finance/profitability")).status(),
      };
      for (const [route, status] of Object.entries(denied)) {
        expect(status, `${route} يجب أن يُرفض`).toBe(403);
      }
    } finally {
      await testPrisma.adminUser.update({ where: { id: staff.id }, data: { role: staff.role } });
    }
  });
});
