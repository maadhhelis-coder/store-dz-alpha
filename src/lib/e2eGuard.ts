// حارس أمان لتشغيل E2E: يُستعمل فقط لمنع نداءات شبكة خارجية حقيقية (Meta CAPI، TikTok
// Events API، Webhooks المسجَّلة، DHD) من الانطلاق فعليًا أثناء اختبارات E2E — التي تعمل
// على نفس قاعدة بيانات الإنتاج (راجع tests/e2e/README.md لتفاصيل قرار العزل). بلا هذا
// الحارس، أي طلب اختباري وهمي كان سيُرسَل كحدث تحويل حقيقي لحسابات Meta/TikTok الإعلانية
// الفعلية، أو يُطلق شحنة DHD وهمية حقيقية، أو يُشغّل webhook مسجَّل فعليًا (مثلًا نحو
// store-dz-agent إن كان مسجَّلاً) — تلويث بيانات حقيقية لا علاقة لها بالاختبار.
//
// العلم E2E_TEST_RUN يُضبَط فقط داخل بيئة الاختبار (.env.test أو ضمن سكربت تشغيل
// الاختبارات) — لا يُضبَط أبدًا فبيئة التشغيل الفعلية (Vercel production env).
export function isE2ETestRun(): boolean {
  return process.env.E2E_TEST_RUN === "1";
}

export function logE2ESkip(what: string): void {
  console.log(`[e2e-guard] skipped real external call during E2E test run: ${what}`);
}
