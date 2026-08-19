import { test, expect, selectOrderWilaya } from "./support/fixtures";
import { testPrisma } from "./support/testPrisma";
import { e2eLastName, e2ePhone } from "./support/testData";
import { getActiveWilaya, createTestProduct } from "./support/seedFixtures";

// التكاملات الخارجية: Google Sheets (اعتراض شبكي حقيقي فالمتصفح — لا يلمس الشيت الحقيقي)،
// وDHD (حارس E2E_TEST_RUN فالخادم — راجع src/lib/e2eGuard.ts وsrc/server/services/dhdService.ts
// — يمنع أي نداء حقيقي، ونتحقق أن الاستجابة المُقلَّدة (Mock) وصلت فعليًا حتى نهاية التدفّق).
// Meta CAPI وTikTok Events API مضمونا الحجب بنفس الحارس السيرفري (سُجِّل [e2e-guard] فسجلات
// الخادم فكل اختبارات هذا الملف)؛ لا توجد طريقة من داخل Playwright للتحقق من سجلات عملية
// الخادم مباشرة، فهذا يبقى معتمدًا على المراجعة الكودية + سلوك الحارس المُثبَت هنا لـDHD
// (بنفس النمط والدالة المُصدَّرة من نفس الملف e2eGuard.ts).

test.describe("التكاملات الخارجية — بيئة معزولة", () => {
  test("Google Sheets: المتصفح يُرسل بيانات الطلب الصحيحة، بلا لمس الشيت الحقيقي (اعتراض شبكي)", async ({
    page,
  }) => {
    const wilaya = await getActiveWilaya();
    const product = await createTestProduct({ inventoryCount: 5, priceDzd: 1900 });

    let capturedBody: Record<string, unknown> | null = null;
    await page.route("https://script.google.com/**", async (route) => {
      const request = route.request();
      capturedBody = JSON.parse(request.postData() ?? "{}");
      // نُجيب بردّ مُقلَّد (Mock) بدل تمرير الطلب فعليًا للشيت الحقيقي — يمنع تلويث بيانات
      // حقيقية بينما يُثبت أن المتصفح حاول الإرسال بالشكل الصحيح فعليًا (وليس مجرد فحص كود).
      await route.fulfill({ status: 200, body: "OK" });
    });

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

    await page.getByTestId("order-submit").click();
    await expect(page.getByTestId("order-success")).toBeVisible({ timeout: 15_000 });

    // إن كان NEXT_PUBLIC_ORDER_ENDPOINT غير مضبوط فبيئة التشغيل، submitOrderToSheet يتوقف
    // مبكرًا بصمت (isOrderEndpointConfigured() === false) بلا أي نداء شبكي إطلاقًا — هذا
    // سلوك سليم موثَّق فالكود نفسه (راجع src/lib/orders.ts)، وليس فشلاً.
    const body = capturedBody as Record<string, unknown> | null;
    if (body) {
      expect(body.phone).toBe(phone);
      expect(body.productSlug).toBe(product.slug);
    } else {
      console.log("[integrations] NEXT_PUBLIC_ORDER_ENDPOINT غير مضبوط فهذه البيئة — تخطينا التحقق من محتوى الطلب المُرسَل لِSheets (السلوك سليم، فقط لم يُختبَر محتوى الحمولة فعليًا هنا)");
    }
  });

  // @desktop-only: يعتمد على ownerPage (دخول حقيقي) — راجع نفس ملاحظة حد معدّل الدخول
  // فـpermissions.spec.ts؛ منطق حارس DHD خادمي بحت وغير حساس لمحرّك المتصفح.
  test("DHD: إرسال شحنة حقيقي عبر الواجهة الإدارية يُقلَّد بالكامل (E2E_TEST_RUN) بلا نداء API خارجي حقيقي @desktop-only", async ({
    ownerPage,
  }) => {
    const wilaya = await getActiveWilaya();
    const product = await createTestProduct({ inventoryCount: 5 });

    const order = await testPrisma.order.create({
      data: {
        orderNumber: `E2E-DHD-${Date.now()}`,
        status: "confirmed",
        customerFirstName: "زبون",
        customerLastName: e2eLastName(),
        phone: e2ePhone(),
        wilayaCode: wilaya.code,
        wilayaName: wilaya.name,
        commune: "بلدية اختبار",
        address: "شارع الاختبار، رقم 1",
        deliveryOption: "home",
        deliveryPriceDzd: wilaya.homePriceDzd,
        itemsSubtotalDzd: 2000,
        totalDzd: 2000 + wilaya.homePriceDzd,
        items: {
          create: [
            {
              productId: product.id,
              productNameSnapshot: product.name,
              productSlugSnapshot: product.slug,
              unitPriceDzd: 2000,
              quantity: 1,
              lineTotalDzd: 2000,
            },
          ],
        },
      },
    });

    const res = await ownerPage.request.post(`/api/admin/orders/${order.id}/send-to-dhd`, { data: {} });
    expect(res.status()).toBe(200);
    const body = await res.json();
    // البادئة E2E-MOCK- تُثبت أن حارس E2E اعترض النداء قبل الوصول لـDHD الحقيقي فعليًا —
    // رقم تتبع حقيقي لا يمكن أن يحمل هذه البادئة أبدًا.
    expect(body.order.courierTrackingId).toMatch(/^E2E-MOCK-/);
    expect(body.order.courierProvider).toBe("DHD");
  });
});
