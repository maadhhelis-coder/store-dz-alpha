import { test as base, expect, type Page } from "@playwright/test";
import { E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD, E2E_STAFF_EMAIL, E2E_STAFF_PASSWORD } from "./adminFixtures";

// رسائل console متوقَّعة/غير خطيرة نتغاضى عنها — أي console.error أو pageerror آخر
// يُفشِل الاختبار فورًا (المتطلب رقم 9: مراقبة أخطاء console/hydration).
//
// "Failed to load resource: ... status of 4xx/5xx": متصفح Chrome يُسجّل هذا تلقائيًا لأي
// استجابة fetch/XHR غير 2xx — سلوك المتصفح نفسه، وليس خطأً فالتطبيق. اختبارات المسارات
// السلبية عمدًا (401 دخول خاطئ، 409 مخزون، 403 صلاحيات...) ستُنتج هذا السطر دائمًا رغم
// أن التطبيق يتعامل معه بشكل صحيح تمامًا (رسالة خطأ واضحة بالواجهة). الأخطاء الحقيقية
// (استثناءات JS، مخالفات CSP، أخطاء hydration) لا تُطابق هذا النمط وتبقى تُفشِل الاختبار.
const IGNORED_CONSOLE_PATTERNS = [/HMR|hot-reload|Fast Refresh/i, /Failed to load resource.*status of \d{3}/i];

async function attachConsoleGuard(page: Page) {
  const unexpected: string[] = [];

  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (IGNORED_CONSOLE_PATTERNS.some((p) => p.test(text))) return;
    unexpected.push(`[console.error] ${text}`);
  });

  page.on("pageerror", (error) => {
    unexpected.push(`[pageerror] ${error.message}`);
  });

  return unexpected;
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/admin/login");
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(password);
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/admin\/?(\?.*)?$/, { timeout: 15_000 });
}

type E2ETestFixtures = {
  consoleErrors: string[];
};

type E2EWorkerFixtures = {
  ownerPage: Page;
  staffPage: Page;
};

// ownerPage/staffPage بنطاق "worker" (وليس "test") عمدًا: حد محاولات دخول الأدمن الحقيقي
// صارم (5 كل 15 دقيقة لكل IP ولكل بريد — راجع src/lib/rateLimit/upstash.ts)، ومشترَك بين
// owner وstaff لأن كليهما يُختبَران من نفس IP محلي (127.0.0.1) هنا. تسجيل دخول واحد فقط
// لكل دور طوال تشغيل الاختبار كله (بدل دخول جديد لكل اختبار على حدة) يُبقي الاختبارات
// قابلة لإعادة التشغيل المتكرر دون اصطدام حقيقي بحد المعدّل — بينما لا يزال يمر فعليًا
// عبر نموذج تسجيل الدخول الحقيقي بالمتصفح (وليس محاكاة جلسة يدويًا) مرة واحدة على الأقل.
export const test = base.extend<E2ETestFixtures, E2EWorkerFixtures>({
  consoleErrors: [
    async ({ page }, use) => {
      const unexpected = await attachConsoleGuard(page);
      await use(unexpected);
      expect(unexpected, `console.error/pageerror غير متوقَّعة:\n${unexpected.join("\n")}`).toEqual([]);
    },
    { auto: true },
  ],

  ownerPage: [
    async ({ browser }, use) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      await login(page, E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD);
      await use(page);
      await context.close();
    },
    { scope: "worker" },
  ],

  staffPage: [
    async ({ browser }, use) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      await login(page, E2E_STAFF_EMAIL, E2E_STAFF_PASSWORD);
      await use(page);
      await context.close();
    },
    { scope: "worker" },
  ],
});

export { expect };
