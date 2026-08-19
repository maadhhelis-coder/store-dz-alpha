import { test, expect } from "./support/fixtures";

// معزول عمدًا فملفه الخاص، ويُشغَّل يدويًا/فخطوة CI منفصلة بعد الحزمة الرئيسية (وليس ضمن
// `npx playwright test` الافتراضي — راجع testIgnore فـplaywright.config.ts): إغراق
// /api/coupons/validate يستنفد الحد (15 كل 10 دقائق — نفس قيمة الإنتاج). أثناء E2E، المحدِّد
// يُفتاح بمعرِّف عشوائي خاص بعملية الخادم نفسها بدل IP الحقيقي المشترك (راجع
// src/app/api/coupons/validate/route.ts) — محاولة أولى برفع السقف لـ200 فقط نجحت مؤقتًا؛
// اكتُشف فعليًا لاحقًا أن Upstash يحتفظ بحالة IP المشترك عبر تشغيلات CI متعددة عبر الزمن (لا
// فقط داخل تشغيلة واحدة)، فتراكم عشرات التشغيلات المتكررة أعاد استنفاد حتى 200. المعرِّف
// العشوائي الجديد لكل بدء خادم يحل المشكلة جذريًا: كل تشغيلة تبدأ بحصة فارغة تمامًا مهما
// تكرّرت التشغيلات السابقة. هذا الاختبار يُغرق 17 طلبًا (يتجاوز 15) ضمن نفس عملية الخادم
// (فتشترك جميعها بنفس المعرِّف العشوائي) ليثبت سلوك 429 الحقيقي فعليًا:
//   npx playwright test tests/e2e/rate-limit-429.spec.ts --project=chromium-desktop
test("429: تجاوز حد التحقق من الكوبونات (15 كل 10 دقائق) يُرجع 429 فعليًا", async ({ request }) => {
  const attempts = Array.from({ length: 17 }, (_, i) =>
    request.post("/api/coupons/validate", { data: { code: `E2E-FLOOD-${i}`, subtotalDzd: 1000 } }),
  );
  const results = await Promise.all(attempts);
  const statuses = results.map((r) => r.status());
  expect(statuses).toContain(429);
});
