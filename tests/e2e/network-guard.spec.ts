import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { test, expect } from "./support/fixtures";
import { testPrisma } from "./support/testPrisma";
import { e2eLastName, e2ePhone } from "./support/testData";
import { getActiveWilaya, createTestProduct } from "./support/seedFixtures";
import { E2E_NETWORK_VIOLATIONS_FILE } from "../../src/lib/e2eNetworkGuard";

// إثبات فعلي (وليس قراءة كود فقط) أن Meta CAPI وTikTok Events API لا يُستدعيان أبدًا أثناء
// E2E، فحالتَي "confirmed" و"delivered" معًا — كلتاهما تُطلق after() منفصلة نحو
// sendMetaCapiEvent/sendTikTokEvent (راجع src/server/services/ordersService.ts:443-449).
// هذا الاختبار لا يثق بحارس isE2ETestRun() التطبيقي وحده: يتحقق من طبقة حماية شبكية
// مستقلة تمامًا (src/lib/e2eNetworkGuard.ts، مُثبَّتة عبر src/instrumentation.ts) تعترض أي
// محاولة فعلية للوصول لـgraph.facebook.com أو business-api.tiktok.com وتُسجّلها فملف —
// لو فشل الحارس التطبيقي لأي سبب (لأي من الحالتين)، هذا الملف كان سيحتوي على انتهاك فعلي.

async function createTestOrder(status: "pending" | "confirmed") {
  const wilaya = await getActiveWilaya();
  const product = await createTestProduct({ inventoryCount: 5 });

  return testPrisma.order.create({
    data: {
      orderNumber: `E2E-NETGUARD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      status,
      customerFirstName: "زبون",
      customerLastName: e2eLastName(),
      phone: e2ePhone(),
      wilayaCode: wilaya.code,
      wilayaName: wilaya.name,
      commune: "بلدية اختبار",
      deliveryOption: "office",
      deliveryPriceDzd: wilaya.officePriceDzd ?? 0,
      itemsSubtotalDzd: 2500,
      totalDzd: 2500 + (wilaya.officePriceDzd ?? 0),
      items: {
        create: [
          {
            productId: product.id,
            productNameSnapshot: product.name,
            productSlugSnapshot: product.slug,
            unitPriceDzd: 2500,
            quantity: 1,
            lineTotalDzd: 2500,
          },
        ],
      },
    },
  });
}

async function assertNoNetworkViolations(ownerPage: Page, orderId: string, targetStatus: "confirmed" | "delivered") {
  const res = await ownerPage.request.patch(`/api/admin/orders/${orderId}/status`, {
    data: { status: targetStatus },
  });
  expect(res.status()).toBe(200);

  // after() تعمل بعد إرسال الاستجابة، خارج دورة الطلب/الرد — ننتظر قليلًا حتى تكتمل
  // فعليًا (بدل استعمال مهلة زمنية عمياء طويلة، نتحقق دوريًا).
  let violations = "";
  for (let i = 0; i < 20; i++) {
    violations = readFileSync(E2E_NETWORK_VIOLATIONS_FILE, "utf-8");
    if (violations.trim().length > 0) break;
    await new Promise((r) => setTimeout(r, 250));
  }

  expect(violations.trim(), `انتهاكات شبكة حقيقية مسجَّلة (${targetStatus}): ${violations}`).toBe("");
}

test.describe("حارس الشبكة: Meta CAPI وTikTok Events API @desktop-only", () => {
  test("تغيير حالة طلب إلى confirmed لا يُطلق أي نداء شبكة حقيقي نحو Meta أو TikTok", async ({ ownerPage }) => {
    const order = await createTestOrder("pending");
    await assertNoNetworkViolations(ownerPage, order.id, "confirmed");
  });

  test("تغيير حالة طلب إلى delivered لا يُطلق أي نداء شبكة حقيقي نحو Meta أو TikTok", async ({ ownerPage }) => {
    // نبدأ من "confirmed" مباشرة (وليس عبر PATCH متتالية) — الهدف اختبار مسار
    // sendMetaCapiOrderDelivered/sendTikTokOrderDelivered تحديدًا (شرط منفصل تمامًا فالكود
    // عن مسار "confirmed"، راجع ordersService.ts:447-449)، لا إعادة اختبار الانتقال الأول.
    const order = await createTestOrder("confirmed");
    await assertNoNetworkViolations(ownerPage, order.id, "delivered");
  });
});
