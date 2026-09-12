import { test, expect, chooseHomeDelivery, selectOrderWilaya } from "./support/fixtures";
import { testPrisma } from "./support/testPrisma";
import { e2eLastName, e2ePhone, e2eVisitorId } from "./support/testData";
import { getActiveWilaya, createTestProduct } from "./support/seedFixtures";

// Idempotency-Key يمنع إنشاء طلبين حقيقيين من نفس محاولة الإرسال (نقر مزدوج، إعادة محاولة
// بعد انقطاع شبكة) — راجع src/lib/idempotency.ts وsrc/app/api/orders/route.ts.

test.describe("منع الطلبات المكررة (Idempotency)", () => {
  test("مستوى API: طلبان متزامنان بنفس Idempotency-Key ينتجان طلبًا واحدًا فقط", async ({ request }) => {
    const wilaya = await getActiveWilaya();
    const product = await createTestProduct({ inventoryCount: 10, priceDzd: 2000 });
    const idempotencyKey = `e2e-idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const payload = {
      firstName: "زبون",
      lastName: e2eLastName(),
      phone: e2ePhone(),
      wilayaCode: wilaya.code,
      commune: "بلدية اختبار",
      deliveryOption: "home" as const,
      address: "شارع الاختبار",
      productSlug: product.slug,
      quantity: 2,
      visitorId: e2eVisitorId(),
    };

    // نُطلق الطلبين بالتوازي فعليًا (بلا انتظار الأول) لمحاكاة السباق الحقيقي: نقر مزدوج
    // أو إعادة محاولة شبكة تتداخل مع الطلب الأول قبل اكتمال معالجته.
    const [res1, res2] = await Promise.all([
      request.post("/api/orders", { data: payload, headers: { "Idempotency-Key": idempotencyKey } }),
      request.post("/api/orders", { data: payload, headers: { "Idempotency-Key": idempotencyKey } }),
    ]);

    // العقد الفعلي لـwithIdempotency (راجع src/lib/idempotency.ts): عند تزامن حقيقي (لا
    // فرق زمني كافٍ)، الطلب الأول ينجح (200/201) والثاني يُرفض بـ409 "قيد المعالجة، حاول
    // بعد لحظات" بدل الانتظار — وليس بالضرورة كلاهما ناجحًا بنفس الجسم. الضمان الحقيقي
    // المطلوب اختباره هنا ليس رمز الحالة نفسه، بل: طلب واحد فقط أُنشئ فعليًا فقاعدة
    // البيانات، والمخزون نُقص مرة واحدة فقط — وهو ما نتحقق منه أدناه مباشرة من DB.
    const results = [res1, res2];
    const successes = results.filter((r) => r.status() === 200 || r.status() === 201);
    const conflicts = results.filter((r) => r.status() === 409);
    expect(successes.length + conflicts.length).toBe(2);
    expect(successes.length).toBeGreaterThanOrEqual(1);

    const orders = await testPrisma.order.findMany({
      where: { phone: payload.phone },
    });
    expect(orders).toHaveLength(1);

    const productAfter = await testPrisma.product.findUniqueOrThrow({ where: { id: product.id } });
    // نُقص مرة واحدة فقط (10 - 2 = 8)، وليس مرتين (10 - 4 = 6) — هذا هو الضمان الجوهري.
    expect(productAfter.inventoryCount).toBe(8);
  });

  test("مستوى API: مفتاحان مختلفان لنفس البيانات ينتجان طلبَين منفصلَين فعلًا (ليس دمجًا زائدًا)", async ({
    request,
  }) => {
    const wilaya = await getActiveWilaya();
    const product = await createTestProduct({ inventoryCount: 10, priceDzd: 2000 });
    const lastName = e2eLastName();
    const phone = e2ePhone();

    const payload = {
      firstName: "زبون",
      lastName,
      phone,
      wilayaCode: wilaya.code,
      commune: "بلدية اختبار",
      deliveryOption: "home" as const,
      address: "شارع الاختبار",
      productSlug: product.slug,
      quantity: 1,
      visitorId: e2eVisitorId(),
    };

    const res1 = await request.post("/api/orders", {
      data: payload,
      headers: { "Idempotency-Key": `e2e-idem-a-${Date.now()}` },
    });
    const res2 = await request.post("/api/orders", {
      data: payload,
      headers: { "Idempotency-Key": `e2e-idem-b-${Date.now()}` },
    });

    expect(res1.status()).toBe(201);
    expect(res2.status()).toBe(201);
    const body1 = await res1.json();
    const body2 = await res2.json();
    expect(body1.orderNumber).not.toBe(body2.orderNumber);

    const orders = await testPrisma.order.findMany({ where: { phone } });
    expect(orders).toHaveLength(2);
  });

  test("مستوى الواجهة: نقر مزدوج سريع على زر تأكيد الطلب لا يُنشئ إلا طلبًا واحدًا", async ({ page }) => {
    const wilaya = await getActiveWilaya();
    const product = await createTestProduct({ inventoryCount: 10, priceDzd: 1500 });

    await page.goto(`/products/${product.slug}`);

    const lastName = e2eLastName();
    const phone = e2ePhone();
    await page.getByTestId("order-full-name").fill(`زبون ${lastName}`);
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

    const submitButton = page.getByTestId("order-submit");
    // شريط «اطلب الآن» ثابت أسفل الصفحة — نُوسّط الزر أولًا فلا تعترضه النقرة
    await submitButton.evaluate((el) => el.scrollIntoView({ block: "center" }));
    // dblclick() بلا force: النقر القسري يُرسَل لإحداثيات الزر لحظة الأمر حتى لو كان
    // الشريط الثابت «اطلب الآن» يغطيه أو قفزت الصفحة للأعلى (ScrollToTopOnMount يعيد
    // التمرير بعد الترطيب) — فالنقرة تصيب الشريط لا الزر، والاستمارة تبقى سليمة بلا أي
    // إرسال. فشِل هكذا فعليًا ثلاث مرات (chromium ثم mobile-chrome، 2026-09-11). بلا force
    // ينتظر Playwright حتى يكون الزر ظاهرًا وغير مغطًّى ثم يُطلق حدثَي click متتابعَين —
    // وهو ما يختبره الحارس المتزامن (submitInFlight) فOrderForm.
    await submitButton.dblclick();

    await expect(page.getByTestId("order-success")).toBeVisible({ timeout: 15_000 });

    const orders = await testPrisma.order.findMany({ where: { phone } });
    expect(orders).toHaveLength(1);
  });
});
