import { test, expect, selectOrderWilaya } from "./support/fixtures";
import { testPrisma } from "./support/testPrisma";
import { e2ePhone, e2eLastName } from "./support/testData";
import {
  getActiveWilaya,
  createTestProduct,
  createTestProductWithVariant,
  createTestFunnel,
  createTestCoupon,
} from "./support/seedFixtures";

// رحلة الشراء الكاملة: صفحة المنتج → فتح نافذة الطلب → ملء البيانات → إرسال → شاشة
// النجاح — مع التحقق من قاعدة البيانات مباشرة (وليس فقط رسالة النجاح بالواجهة)، تمامًا
// كما طلب التدقيق. تعمل على كل من chromium-desktop وmobile-chrome وwebkit-desktop
// (راجع playwright.config.ts projects).

test.describe("رحلة الشراء الأساسية", () => {
  test("منتج بسيط بلا متغيّرات: إتمام الطلب ينشئ صفًا حقيقيًا وينقص المخزون", async ({ page }) => {
    const wilaya = await getActiveWilaya();
    const product = await testPrisma.product.findUniqueOrThrow({
      where: { id: (await createTestProduct({ inventoryCount: 10, priceDzd: 2500 })).id },
    });

    await page.goto(`/products/${product.slug}`);
    // زر "اطلب الآن" قد يظهر مرتين (الزر الرئيسي + الشريط اللاصق أسفل الصفحة) — نستهدف الأول دائمًا.
    await expect(page.getByTestId("order-now-button").first()).toBeVisible();
    await page.getByTestId("order-now-button").first().click();

    const lastName = e2eLastName();
    const phone = e2ePhone();
    await page.getByTestId("order-first-name").fill("زبون");
    await page.getByTestId("order-last-name").fill(lastName);
    await page.getByTestId("order-phone").fill(phone);
    await selectOrderWilaya(page, wilaya.code);
    await page.getByTestId("order-commune").fill("بلدية اختبار").catch(() => {});
    // البلدية قد تكون select أو input حسب توفر بيانات الولاية — نتعامل مع الحالتين.
    const communeEl = page.getByTestId("order-commune");
    if ((await communeEl.evaluate((el) => el.tagName)) === "SELECT") {
      await communeEl.selectOption({ index: 1 });
    }
    const addressField = page.getByTestId("order-address");
    if (await addressField.isVisible().catch(() => false)) {
      await addressField.fill("شارع الاختبار، رقم 1");
    }

    await page.getByTestId("order-submit").click();

    await expect(page.getByTestId("order-success")).toBeVisible({ timeout: 15_000 });
    const orderNumberText = await page.getByTestId("order-number").textContent();
    expect(orderNumberText).toMatch(/^SD-\d+$/);

    // التحقق الحقيقي: القاعدة، وليس فقط الواجهة.
    const order = await testPrisma.order.findFirst({
      where: { orderNumber: orderNumberText!.trim() },
      include: { items: true },
    });
    expect(order).not.toBeNull();
    expect(order!.customerLastName).toBe(lastName);
    expect(order!.phone).toBe(phone);
    expect(order!.status).toBe("pending");
    expect(order!.items).toHaveLength(1);
    expect(order!.items[0].productId).toBe(product.id);
    expect(order!.totalDzd).toBeGreaterThan(0);

    const productAfter = await testPrisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(productAfter.inventoryCount).toBe(9);
  });

  test("منتج بمتغيّر (Variant): اختيار اللون يُسجَّل فالطلب وينقص مخزون المتغيّر تحديدًا", async ({ page }) => {
    const wilaya = await getActiveWilaya();
    const { product, variant } = await createTestProductWithVariant({ inventoryCount: 5 });

    await page.goto(`/products/${product.slug}`);
    await page.getByTestId("order-now-button").first().click();

    await page.getByTestId("order-variant-option").first().click();

    const lastName = e2eLastName();
    const phone = e2ePhone();
    await page.getByTestId("order-first-name").fill("زبون");
    await page.getByTestId("order-last-name").fill(lastName);
    await page.getByTestId("order-phone").fill(phone);
    await selectOrderWilaya(page, wilaya.code);
    const communeEl = page.getByTestId("order-commune");
    if ((await communeEl.evaluate((el) => el.tagName)) === "SELECT") {
      await communeEl.selectOption({ index: 1 });
    } else {
      await communeEl.fill("بلدية اختبار");
    }
    const addressField = page.getByTestId("order-address");
    if (await addressField.isVisible().catch(() => false)) {
      await addressField.fill("شارع الاختبار، رقم 1");
    }

    await page.getByTestId("order-submit").click();
    await expect(page.getByTestId("order-success")).toBeVisible({ timeout: 15_000 });

    const orderNumberText = (await page.getByTestId("order-number").textContent())!.trim();
    const order = await testPrisma.order.findFirstOrThrow({
      where: { orderNumber: orderNumberText },
      include: { items: true },
    });
    expect(order.items[0].variantId).toBe(variant.id);

    const variantAfter = await testPrisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(variantAfter.inventoryCount).toBe(4);
    // مخزون المنتج الأساسي لا يجب أن يتأثر — الخصم يجب أن يطال المتغيّر فقط.
    const productAfter = await testPrisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(productAfter.inventoryCount).toBe(5);
  });

  test("صفحة هبوط (Landing Page /lp/[slug]): إتمام الطلب من نفس تدفّق النافذة", async ({ page }) => {
    const wilaya = await getActiveWilaya();
    const product = await createTestProduct({ inventoryCount: 8, priceDzd: 1800 });
    const funnel = await createTestFunnel(product.id, { pageType: "funnel" });

    await page.goto(`/lp/${funnel.slug}`);
    await expect(page.getByTestId("order-now-button").first()).toBeVisible();
    await page.getByTestId("order-now-button").first().click();

    const lastName = e2eLastName();
    const phone = e2ePhone();
    await page.getByTestId("order-first-name").fill("زبون");
    await page.getByTestId("order-last-name").fill(lastName);
    await page.getByTestId("order-phone").fill(phone);
    await selectOrderWilaya(page, wilaya.code);
    const communeEl = page.getByTestId("order-commune");
    if ((await communeEl.evaluate((el) => el.tagName)) === "SELECT") {
      await communeEl.selectOption({ index: 1 });
    } else {
      await communeEl.fill("بلدية اختبار");
    }
    const addressField = page.getByTestId("order-address");
    if (await addressField.isVisible().catch(() => false)) {
      await addressField.fill("شارع الاختبار، رقم 1");
    }

    await page.getByTestId("order-submit").click();
    await expect(page.getByTestId("order-success")).toBeVisible({ timeout: 15_000 });

    const orderNumberText = (await page.getByTestId("order-number").textContent())!.trim();
    const order = await testPrisma.order.findFirst({ where: { orderNumber: orderNumberText } });
    expect(order).not.toBeNull();
    expect(order!.customerLastName).toBe(lastName);
  });

  test("كوبون خصم صالح: يُطبَّق فعليًا ويُخفِّض المجموع فقاعدة البيانات", async ({ page }) => {
    const wilaya = await getActiveWilaya();
    const product = await createTestProduct({ inventoryCount: 10, priceDzd: 4000 });
    const coupon = await createTestCoupon({ type: "fixed", value: 500 });

    await page.goto(`/products/${product.slug}`);
    await page.getByTestId("order-now-button").first().click();

    const lastName = e2eLastName();
    const phone = e2ePhone();
    await page.getByTestId("order-first-name").fill("زبون");
    await page.getByTestId("order-last-name").fill(lastName);
    await page.getByTestId("order-phone").fill(phone);
    await selectOrderWilaya(page, wilaya.code);
    const communeEl = page.getByTestId("order-commune");
    if ((await communeEl.evaluate((el) => el.tagName)) === "SELECT") {
      await communeEl.selectOption({ index: 1 });
    } else {
      await communeEl.fill("بلدية اختبار");
    }
    const addressField = page.getByTestId("order-address");
    if (await addressField.isVisible().catch(() => false)) {
      await addressField.fill("شارع الاختبار، رقم 1");
    }

    await page.getByTestId("order-coupon-input").fill(coupon.code);
    await page.getByTestId("order-coupon-apply").click();
    await expect(page.getByText("تم تطبيق كود الخصم بنجاح")).toBeVisible({ timeout: 10_000 });

    await page.getByTestId("order-submit").click();
    await expect(page.getByTestId("order-success")).toBeVisible({ timeout: 15_000 });

    const orderNumberText = (await page.getByTestId("order-number").textContent())!.trim();
    const order = await testPrisma.order.findFirstOrThrow({ where: { orderNumber: orderNumberText } });
    expect(order.couponCode).toBe(coupon.code);
    expect(order.discountDzd).toBe(500);
    expect(order.totalDzd).toBe(order.itemsSubtotalDzd + order.deliveryPriceDzd - 500);

    const couponAfter = await testPrisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } });
    expect(couponAfter.usedCount).toBe(1);
  });
});
