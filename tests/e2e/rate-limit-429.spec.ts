import { test, expect } from "./support/fixtures";

// معزول عمدًا فملفه الخاص، ويُشغَّل يدويًا/فخطوة CI منفصلة بعد الحزمة الرئيسية (وليس ضمن
// `npx playwright test` الافتراضي — راجع testIgnore فـplaywright.config.ts): إغراق
// /api/coupons/validate بـ17 طلبًا يستنفد حد معدّل حقيقي مشترَك بنفس IP (15 كل 10 دقائق،
// Upstash slidingWindow — src/lib/rateLimit/upstash.ts) لمدة 10 دقائق كاملة تقريبًا. أي
// اختبار آخر يتحقق من كوبون شرعي (checkout.spec.ts، checkout-negative.spec.ts،
// race-conditions.spec.ts) — عبر أي مشروع متصفح — خلال تلك النافذة كان يفشل زورًا بـ429 لا
// علاقة له بمنطق التطبيق (اكتُشف فعليًا أثناء بناء هذه المنظومة: نفس الاختبار داخل
// api-status-codes.spec.ts كان يُسقط اختبار الكوبون فـchromium-desktop وmobile-chrome فنفس
// التشغيلة). لذا يُشغَّل هذا الملف بمفرده، أخيرًا، بعد كل شيء آخر يحتاج كوبونات شرعية:
//   npx playwright test tests/e2e/rate-limit-429.spec.ts --project=chromium-desktop
test("429: تجاوز حد التحقق من الكوبونات (15 كل 10 دقائق حسب IP) يُرجع 429 فعليًا", async ({ request }) => {
  const attempts = Array.from({ length: 17 }, (_, i) =>
    request.post("/api/coupons/validate", { data: { code: `E2E-FLOOD-${i}`, subtotalDzd: 1000 } }),
  );
  const results = await Promise.all(attempts);
  const statuses = results.map((r) => r.status());
  expect(statuses).toContain(429);
});
