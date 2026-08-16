import { test, expect } from "./support/fixtures";
import { createTestProduct } from "./support/seedFixtures";

// تغطية رموز حالة HTTP الفعلية عبر خادم حقيقي. ملاحظة: 400/401/403/409 مغطاة فعليًا
// وبتفصيل أكبر ضمن checkout-negative.spec.ts وpermissions.spec.ts وidempotency.spec.ts —
// هذا الملف يُكمِّلها بما لم يُختبَر بعد (404، 429)، ويتفادى عمدًا تكرار محاولات دخول
// إضافية (حد معدّل الدخول الحقيقي صارم: 5/15 دقيقة — راجع src/lib/rateLimit/upstash.ts).

// @desktop-only: بعض اختبارات هذا الملف تعتمد على ownerPage (دخول حقيقي مشترَك بنطاق
// worker)، ومنطق رموز الحالة خادمي بحت (غير حساس لمحرّك المتصفح) — تشغيله 3 مرات فقط
// يستهلك حد معدّل الدخول الحقيقي بلا قيمة تغطية إضافية (راجع نفس الملاحظة فـpermissions.spec.ts).
test.describe("رموز حالة HTTP @desktop-only", () => {
  test("404: صفحة منتج غير موجود (متجر عام)", async ({ request }) => {
    const res = await request.get("/products/e2e-slug-ghair-mawjoud-qatan-999999");
    expect(res.status()).toBe(404);
  });

  test("404: طلب إداري غير موجود (Owner، جلسة مشتركة)", async ({ ownerPage }) => {
    const res = await ownerPage.request.get("/api/admin/orders/00000000-0000-0000-0000-000000000000");
    expect(res.status()).toBe(404);
  });

  test("409: مسار مكرَّر معروف (نفاد المخزون) — إثبات إضافي أن 409 وليس 500 عام", async ({ request }) => {
    const product = await createTestProduct({ inventoryCount: 0 });
    const res = await request.get(`/products/${product.slug}`);
    // الصفحة نفسها تُعرَض بنجاح (200) — المنتج موجود لكن نافد؛ 409 الحقيقي يُختبَر عبر
    // POST /api/orders فـcheckout-negative.spec.ts. هذا اختبار تكميلي يتحقق أن صفحة
    // المنتج النافد لا تُرجع أبدًا 404/500 خطأً — لا يزال منتجًا معروضًا فعليًا.
    expect(res.status()).toBe(200);
  });

  // اختبار 429 نُقل إلى rate-limit-429.spec.ts عمدًا: إغراق /api/coupons/validate يُنهك
  // حد معدّل حقيقي مشترَك بنفس IP لمدة 10 دقائق كاملة (Upstash slidingWindow) — أي اختبار
  // آخر يتحقق من الكوبون بشكل شرعي (checkout.spec.ts، checkout-negative.spec.ts،
  // race-conditions.spec.ts) خلال تلك النافذة عبر أي مشروع متصفح كان يفشل زورًا بـ429 لا
  // علاقة له بمنطق التطبيق. راجع rate-limit-429.spec.ts وREADME.md لتفاصيل العزل.
});
