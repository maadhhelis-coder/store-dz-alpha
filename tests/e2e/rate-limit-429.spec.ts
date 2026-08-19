import { test, expect } from "./support/fixtures";

// معزول عمدًا فملفه الخاص، ويُشغَّل يدويًا/فخطوة CI منفصلة بعد الحزمة الرئيسية (وليس ضمن
// `npx playwright test` الافتراضي — راجع testIgnore فـplaywright.config.ts): إغراق
// /api/coupons/validate يستنفد حد معدّل حقيقي مشترَك بنفس IP. الحد أثناء E2E تحديدًا هو 200
// كل 10 دقائق (وليس 15 كما فالإنتاج — راجع src/app/api/coupons/validate/route.ts) بعد أن
// اكتُشف فعليًا (تشغيلة CI حقيقية) أن 15 غير كافٍ حتى بلا أي إغراق متعمَّد: حجم طلبات
// الكوبون الشرعية عبر checkout.spec.ts وcheckout-negative.spec.ts وrace-conditions.spec.ts
// عبر مشاريع المتصفح الثلاثة (تتشارك IP واحد فCI) وحده كان يتجاوز 15 خلال نافذة 10 دقائق.
// هذا الاختبار يُغرق 202 طلب (يتجاوز 200) ليثبت سلوك 429 الحقيقي رغم السقف الأعلى:
//   npx playwright test tests/e2e/rate-limit-429.spec.ts --project=chromium-desktop
test("429: تجاوز حد التحقق من الكوبونات (200 كل 10 دقائق حسب IP أثناء E2E) يُرجع 429 فعليًا", async ({
  request,
}) => {
  const attempts = Array.from({ length: 202 }, (_, i) =>
    request.post("/api/coupons/validate", { data: { code: `E2E-FLOOD-${i}`, subtotalDzd: 1000 } }),
  );
  const results = await Promise.all(attempts);
  const statuses = results.map((r) => r.status());
  expect(statuses).toContain(429);
});
