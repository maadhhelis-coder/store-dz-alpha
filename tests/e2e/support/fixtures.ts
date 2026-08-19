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

// قائمة الولاية بنموذج الطلب تُملأ عبر جلب عميل غير متزامن (useDeliveryWilayas → GET
// /api/wilayas) بعد mount — عنصر <select> نفسه يصبح تفاعليًا فورًا (لا يمنعه Playwright's
// actionability check)، لكن بلا أي <option> بعد حتى يكتمل الجلب. selectOption("code")
// الخام كان يفشل أحيانًا (اكتُشف فعليًا فتشغيلة CI حقيقية: TimeoutError على locator
// resolved بنجاح لكن بلا الخيار المطلوب بعد) — ينتظر Playwright جهوزية العنصر نفسه فقط، لا
// وجود قيمة <option> معيّنة بداخله. الانتظار الصريح هنا على <option> الهدف يزيل هذا التسابق
// جذريًا بدل الاعتماد على توقيت الشبكة العرضي.
export async function selectOrderWilaya(page: Page, wilayaCode: number) {
  const select = page.getByTestId("order-wilaya");
  try {
    await select.locator(`option[value="${wilayaCode}"]`).waitFor({ state: "attached", timeout: 15_000 });
  } catch (waitError) {
    // فشل نادر هنا كان صعب التشخيص سابقًا (السبب الحقيقي غير مؤكد: بيانات API فعلية وقت
    // الفشل لم تكن مسجَّلة). نلتقط هنا فعليًا ماذا يُرجعه /api/wilayas مباشرة من نفس صفحة
    // المتصفح فلحظة الفشل (وليس افتراضًا) قبل رمي الخطأ الأصلي، ليظهر الدليل فسجلات CI.
    const liveApiResult = await page
      .evaluate(async () => {
        try {
          const res = await fetch("/api/wilayas");
          const body = await res.text();
          return { status: res.status, body: body.slice(0, 2000) };
        } catch (fetchError) {
          return { fetchError: fetchError instanceof Error ? fetchError.message : String(fetchError) };
        }
      })
      .catch((evalError) => ({ evalError: evalError instanceof Error ? evalError.message : String(evalError) }));
    const selectOptionsHtml = await select.evaluate((el) => el.outerHTML).catch(() => "<تعذّر القراءة>");
    console.error(
      `[selectOrderWilaya] فشل انتظار option[value="${wilayaCode}"]. حالة /api/wilayas الحية وقت الفشل: ${JSON.stringify(liveApiResult)}. محتوى <select> الفعلي: ${selectOptionsHtml}`,
    );
    throw waitError;
  }
  await select.selectOption(String(wilayaCode));
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
