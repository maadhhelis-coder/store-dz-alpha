export async function register() {
  // يعمل فقط فعملية خادم Node.js الحقيقية (وليس Edge Runtime)، ويصبح فعليًا فقط لو كان
  // E2E_TEST_RUN=1 (مضبوط حصرًا داخل عملية next start المحلية المؤقتة أثناء اختبارات
  // E2E — راجع playwright.config.ts وsrc/lib/e2eNetworkGuard.ts). لا أثر له إطلاقًا فبيئة
  // الإنتاج الفعلية.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { installE2ENetworkGuard } = await import("@/lib/e2eNetworkGuard");
    installE2ENetworkGuard();
  }
}
