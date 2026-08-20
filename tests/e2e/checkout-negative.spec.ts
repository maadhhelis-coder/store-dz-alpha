import { test, expect } from "./support/fixtures";
import { testPrisma } from "./support/testPrisma";
import { e2eLastName, e2ePhone, e2eVisitorId } from "./support/testData";
import { getActiveWilaya, createTestProduct, createTestCoupon, withTemporarilyInactiveWilaya } from "./support/seedFixtures";

// حالات الطلب الخاطئة/الممنوعة — يجب أن تُرفض بوضوح، وألا يُنشئ أي منها سطرًا فقاعدة
// البيانات (نتحقق من DB مباشرة، وليس فقط من رسالة الواجهة).

test.describe("رفض الطلبات غير الصحيحة", () => {
  test("منتج نافد المخزون: الزر معطَّل ولا تُفتح نافذة الطلب إطلاقًا", async ({ page }) => {
    const product = await createTestProduct({ inventoryCount: 0 });
    await page.goto(`/products/${product.slug}`);

    const button = page.getByTestId("order-now-button").first();
    await expect(button).toBeVisible();
    await expect(button).toBeDisabled();
    await expect(page.getByText("نفذ من المخزون").first()).toBeVisible();
  });

  // خانة كود الخصم حُذفت من نافذة الطلب فالواجهة، لكن /api/coupons/validate يبقى مسارًا
  // عامًا حقيقيًا (قد يُستدعى من قنوات أخرى مستقبلًا) — لذا يبقى الاختبار على مستوى API.
  test("كود خصم غير موجود عبر API: يُرفض بوضوح ولا يُعتبر صالحًا", async ({ request }) => {
    const res = await request.post("/api/coupons/validate", {
      data: { code: "CODE-GHAIR-MAWJOUD-999", subtotalDzd: 3000 },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.valid).toBe(false);
  });

  test("كود خصم منتهي الصلاحية عبر API: يُرفض ولا يُخصَم شيء ولا يُستهلك", async ({ request }) => {
    const expiredCoupon = await createTestCoupon({
      type: "fixed",
      value: 500,
      expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // بالأمس
    });

    const res = await request.post("/api/coupons/validate", {
      data: { code: expiredCoupon.code, subtotalDzd: 3000 },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.valid).toBe(false);

    const couponAfter = await testPrisma.coupon.findUniqueOrThrow({ where: { id: expiredCoupon.id } });
    expect(couponAfter.usedCount).toBe(0);
  });

  test("طلب مباشر عبر API بكمية تفوق المخزون الفعلي (تجاوز واجهة المستخدم): يُرفض بـ409 ولا يُنشئ طلبًا", async ({
    request,
  }) => {
    const wilaya = await getActiveWilaya();
    const product = await createTestProduct({ inventoryCount: 2, priceDzd: 1000 });

    const res = await request.post("/api/orders", {
      data: {
        firstName: "زبون",
        lastName: e2eLastName(),
        phone: e2ePhone(),
        wilayaCode: wilaya.code,
        commune: "بلدية اختبار",
        deliveryOption: "home",
        address: "شارع الاختبار",
        productSlug: product.slug,
        // 15 ضمن الحد الأعلى المسموح بمخطط orderCreateSchema (1-20) — لكنه يفوق المخزون
        // الفعلي (2)، فيختبر فحص المخزون تحديدًا (409) لا فحص الصيغة العام (400).
        quantity: 15,
        visitorId: e2eVisitorId(),
      },
    });

    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.error).toBeTruthy();

    const orderCount = await testPrisma.order.count({ where: { items: { some: { productId: product.id } } } });
    expect(orderCount).toBe(0);
    const productAfter = await testPrisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(productAfter.inventoryCount).toBe(2); // لم يُنقَص شيء
  });

  test("طلب مباشر عبر API برقم هاتف غير صحيح: يُرفض بـ400", async ({ request }) => {
    const wilaya = await getActiveWilaya();
    const product = await createTestProduct({ inventoryCount: 5 });

    const res = await request.post("/api/orders", {
      data: {
        firstName: "زبون",
        lastName: e2eLastName(),
        phone: "12345", // صيغة غير صحيحة إطلاقًا
        wilayaCode: wilaya.code,
        commune: "بلدية اختبار",
        deliveryOption: "home",
        address: "شارع الاختبار",
        productSlug: product.slug,
        quantity: 1,
      },
    });

    expect(res.status()).toBe(400);
    const orderCount = await testPrisma.order.count({ where: { items: { some: { productId: product.id } } } });
    expect(orderCount).toBe(0);
  });

  test("طلب مباشر عبر API لولاية غير نشطة: يُرفض ولا يُنشئ طلبًا", async ({ request }) => {
    const product = await createTestProduct({ inventoryCount: 5 });

    await withTemporarilyInactiveWilaya(async (inactiveWilaya) => {
      const res = await request.post("/api/orders", {
        data: {
          firstName: "زبون",
          lastName: e2eLastName(),
          phone: e2ePhone(),
          wilayaCode: inactiveWilaya.code,
          commune: "بلدية اختبار",
          deliveryOption: "home",
          address: "شارع الاختبار",
          productSlug: product.slug,
          quantity: 1,
          visitorId: e2eVisitorId(),
        },
      });

      expect([400, 404]).toContain(res.status());
    });

    const orderCount = await testPrisma.order.count({ where: { items: { some: { productId: product.id } } } });
    expect(orderCount).toBe(0);
  });
});
