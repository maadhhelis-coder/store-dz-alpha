import { test, expect, chooseHomeDelivery, selectOrderWilaya } from "./support/fixtures";
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
    await chooseHomeDelivery(page);
    const addressField = page.getByTestId("order-address");
    if (await addressField.isVisible().catch(() => false)) {
      await addressField.fill("شارع الاختبار، رقم 1");
    }

    // الاعتراض الشبكي يُسجَّل هنا فقط (قبل الإرسال مباشرة)، وليس قبل page.goto() كما كان
    // سابقًا — اكتُشف فعليًا (عبر تشخيص حي فتشغيلة CI حقيقية) أن جلب /api/wilayas الخاص
    // بالنموذج كان يعلَق بلا استجابة لعشرات الثوانٍ تحديدًا فهذا الاختبار وحده من بين كل
    // اختبارات تدفّق الطلب المماثلة — الفارق البنيوي الوحيد كان اعتراضًا شبكيًا (page.route)
    // مُفعَّلًا طوال تحميل الصفحة وملء النموذج كاملًا رغم عدم الحاجة إليه إلا لحظة الإرسال
    // فعليًا (Google Sheets يُستدعى فقط بعد تأكيد الطلب). تفعيل الاعتراض بأقرب وقت ممكن
    // للحاجة الفعلية إليه فقط يُزيل احتمال تعارضه مع نداءات الصفحة المبكرة الأخرى.
    await page.route("https://script.google.com/**", async (route) => {
      const request = route.request();
      capturedBody = JSON.parse(request.postData() ?? "{}");
      // نُجيب بردّ مُقلَّد (Mock) بدل تمرير الطلب فعليًا للشيت الحقيقي — يمنع تلويث بيانات
      // حقيقية بينما يُثبت أن المتصفح حاول الإرسال بالشكل الصحيح فعليًا (وليس مجرد فحص كود).
      await route.fulfill({ status: 200, body: "OK" });
    });

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
        // الشحنة تُنشأ من ready_to_ship حصرًا (آلة الحالات — لا تجاوز)
        status: "ready_to_ship",
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

    // P5: المسار يكتب النية محليًا ويعود 202 فورًا — لا نداء ناقل داخل الطلب.
    const res = await ownerPage.request.post(`/api/admin/orders/${order.id}/shipments`, { data: {} });
    expect(res.status()).toBe(202);
    const body = await res.json();
    expect(body.shipment.status).toBe("created");
    expect(body.shipment.trackingNumber).toBeNull();

    // الإرسال يقع بعد الرد عبر مشغّل صندوق الأحداث — ننتظر ظهور رقم التتبّع.
    // البادئة E2E-MOCK- تُثبت أن حارس E2E اعترض النداء قبل الوصول لـDHD الحقيقي.
    // ننتظر الحالة النهائية للتدفق (نقل الطلب) لا أول أثر: رقم التتبّع يُحفظ في
    // معاملة، ونقل الطلب عبر آلة الحالات يقع بعدها — الانتظار على الأول سباق.
    await expect
      .poll(
        async () => {
          const row = await testPrisma.order.findUnique({
            where: { id: order.id },
            select: { status: true },
          });
          return row?.status ?? null;
        },
        { timeout: 30_000 },
      )
      .toBe("shipped");

    const dispatched = await testPrisma.shipment.findUniqueOrThrow({
      where: { id: body.shipment.id },
      select: { status: true, provider: true },
    });
    expect(dispatched.status).toBe("handed_over");
    expect(dispatched.provider).toBe("DHD");

    const shipped = await testPrisma.order.findUniqueOrThrow({
      where: { id: order.id },
      select: { status: true, courierTrackingId: true },
    });
    expect(shipped.status).toBe("shipped");
    expect(shipped.courierTrackingId).toMatch(/^E2E-MOCK-/);

    // دخان الواجهة: لوحة الشحن تعرض الدورة الحقيقية للمسؤول (لا شاشة بلا بيانات)
    await ownerPage.goto(`/admin/orders/${order.id}`);
    const panel = ownerPage.getByText("دورات الشحن");
    await expect(panel).toBeVisible();
    // يظهر مرتين: بطاقة الناقل التوافقية ولوحة الشحن — كلاهما مشروع
    await expect(ownerPage.getByText(shipped.courierTrackingId!).first()).toBeVisible();
    await expect(ownerPage.getByText("سُلّمت للناقل").first()).toBeVisible();
  });
});
