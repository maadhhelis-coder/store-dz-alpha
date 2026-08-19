import { test, expect, selectOrderWilaya } from "./support/fixtures";
import { testPrisma } from "./support/testPrisma";
import { e2eLastName, e2ePhone, e2eVisitorId } from "./support/testData";
import { getActiveWilaya, createTestProduct, createTestCoupon } from "./support/seedFixtures";

// سباقات تزامن حقيقية عبر الواجهة نفسها (متصفحان/سياقان منفصلان يُرسلان طلبَين حقيقيَّين
// شبه متزامنَين) — وليس مجرد استدعاء دوال الخدمة مباشرة. يتحقق أن الحماية الذرّية
// (updateMany بشرط WHERE) فعلية من طرف إلى طرف عبر HTTP الحقيقي، لا فرضية نظرية فقط.

test.describe("سباقات التزامن عبر الواجهة", () => {
  test("آخر قطعة فالمخزون: طلبان حقيقيان متزامنان، ينجح واحد فقط ولا يُباع المخزون مرتين", async ({ browser }) => {
    const wilaya = await getActiveWilaya();
    const product = await createTestProduct({ inventoryCount: 1, priceDzd: 2500 });

    const [contextA, contextB] = await Promise.all([browser.newContext(), browser.newContext()]);
    const [pageA, pageB] = await Promise.all([contextA.newPage(), contextB.newPage()]);

    async function fillOrderForm(page: typeof pageA) {
      await page.goto(`/products/${product.slug}`);
      await page.getByTestId("order-now-button").first().click();
      await page.getByTestId("order-first-name").fill("زبون");
      await page.getByTestId("order-last-name").fill(e2eLastName());
      await page.getByTestId("order-phone").fill(e2ePhone());
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
    }

    await Promise.all([fillOrderForm(pageA), fillOrderForm(pageB)]);

    // الضغط على "تأكيد الطلبية" بالتوازي الحقيقي فسياقَي متصفح منفصلَين تمامًا — أقرب
    // محاكاة ممكنة لزبونين حقيقيين يطلبان آخر قطعة فنفس اللحظة تقريبًا.
    await Promise.all([pageA.getByTestId("order-submit").click(), pageB.getByTestId("order-submit").click()]);

    // ملاحظة مهمة: locator.isVisible() يفحص الـDOM فورًا بلا انتظار/إعادة محاولة (خلافًا
    // لـexpect().toBeVisible() الذي يُكرِّر الفحص) — استعماله هنا كان يُرجع false فورًا
    // لكلا الصفحتين قبل اكتمال الطلب فعليًا على الخادم، فيبدو الاختبار وكأن كليهما فشل
    // رغم أن أحدهما ينجح فعليًا (تحقّقنا لاحقًا: صف الطلب يظهر فالتنظيف النهائي). النمط
    // الصحيح: انتظار فعلي (waitFor) حتى تظهر إحدى الحالتين (نجاح أو خطأ) قبل فحص القاعدة.
    async function waitForOutcome(page: typeof pageA): Promise<"success" | "error" | "unknown"> {
      const success = page.getByTestId("order-success").waitFor({ state: "visible", timeout: 20_000 }).then(() => "success" as const);
      const error = page.getByTestId("order-error-screen").waitFor({ state: "visible", timeout: 20_000 }).then(() => "error" as const);
      return Promise.race([success, error]).catch(() => "unknown" as const);
    }

    const [outcomeA, outcomeB] = await Promise.all([waitForOutcome(pageA), waitForOutcome(pageB)]);
    const successA = outcomeA === "success";
    const successB = outcomeB === "success";

    const orders = await testPrisma.order.findMany({ where: { items: { some: { productId: product.id } } } });
    expect(orders).toHaveLength(1);

    const productAfter = await testPrisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(productAfter.inventoryCount).toBe(0);

    expect([successA, successB].filter(Boolean).length).toBe(1);

    await contextA.close();
    await contextB.close();
  });

  test("كوبون بحد استخدام واحد: استخدامان متزامنان عبر API، ينجح واحد فقط", async ({ request }) => {
    const wilaya = await getActiveWilaya();
    const product = await createTestProduct({ inventoryCount: 10, priceDzd: 3000 });
    const coupon = await createTestCoupon({ type: "fixed", value: 500, usageLimit: 1 });

    function orderPayload() {
      return {
        firstName: "زبون",
        lastName: e2eLastName(),
        phone: e2ePhone(),
        wilayaCode: wilaya.code,
        commune: "بلدية اختبار",
        deliveryOption: "home" as const,
        address: "شارع الاختبار",
        productSlug: product.slug,
        quantity: 1,
        couponCode: coupon.code,
        visitorId: e2eVisitorId(),
      };
    }

    const [res1, res2] = await Promise.all([
      request.post("/api/orders", { data: orderPayload() }),
      request.post("/api/orders", { data: orderPayload() }),
    ]);

    const statuses = [res1.status(), res2.status()];
    // واحد فقط ينجح بالكوبون (201)؛ الآخر يُرفض بوضوح (400 — الكوبون استُنفد) لأن
    // usageLimit=1، وليس كلاهما ينجح بخصم مضاعف.
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);

    const couponAfter = await testPrisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } });
    expect(couponAfter.usedCount).toBe(1);
  });
});
