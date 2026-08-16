import { test, expect } from "./support/fixtures";
import { testPrisma } from "./support/testPrisma";
import { E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD } from "./support/adminFixtures";

// دخول/خروج المسؤول + مصفوفة صلاحيات Owner مقابل Staff — بحسابَين حقيقيَّين عبر واجهة
// تسجيل الدخول الفعلية (وليس محاكاة جلسة يدويًا)، والتحقق من رموز الحالة الفعلية.

// @desktop-only على كلا الوصفين: حد معدّل الدخول الحقيقي صارم (5 محاولات/15 دقيقة، IP+بريد
// — راجع src/lib/rateLimit/upstash.ts) وهو نفس IP محلي واحد عبر كل المشاريع (Projects)؛
// تكرار محاولات دخول حقيقية 3 مرات (chromium/mobile/webkit) يستنفد الحد بلا أي قيمة تغطية
// إضافية حقيقية (منطق تسجيل الدخول/الصلاحيات خادمي بحت، غير حساس لمحرّك المتصفح) — لذا يُشغَّل
// مرة واحدة فقط عبر chromium-desktop (راجع grepInvert في playwright.config.ts).
test.describe("تسجيل الدخول والخروج @desktop-only", () => {
  test("دخول ببيانات صحيحة (Owner): إعادة توجيه فعلية للوحة التحكم", async ({ page }) => {
    await page.goto("/admin/login");
    await page.getByTestId("login-email").fill(E2E_OWNER_EMAIL);
    await page.getByTestId("login-password").fill(E2E_OWNER_PASSWORD);
    await page.getByTestId("login-submit").click();
    await page.waitForURL(/\/admin\/?(\?.*)?$/, { timeout: 15_000 });
    expect(page.url()).toContain("/admin");
  });

  test("دخول بكلمة مرور خاطئة: رسالة خطأ واضحة، لا إعادة توجيه", async ({ page }) => {
    await page.goto("/admin/login");
    await page.getByTestId("login-email").fill(E2E_OWNER_EMAIL);
    await page.getByTestId("login-password").fill("كلمة-مرور-خاطئة-قطعًا-123");
    await page.getByTestId("login-submit").click();

    await expect(page.getByTestId("login-error")).toBeVisible({ timeout: 10_000 });
    expect(page.url()).toContain("/admin/login");
  });
});

test.describe("مصفوفة صلاحيات Owner مقابل Staff @desktop-only", () => {
  test.afterEach(async () => {
    await testPrisma.webhook.deleteMany({ where: { url: { contains: "e2e-permissions-test" } } });
  });

  test("Owner: إنشاء webhook (إجراء يقتصر على المالك) ← 201", async ({ ownerPage }) => {
    // page.request يشارك نفس ملفات تعريف الارتباط (cookies) لسياق المتصفح المسجَّل دخوله
    // فعليًا عبر واجهة تسجيل الدخول — تحقّق حقيقي للجلسة، لا محاكاة يدوية.
    const res = await ownerPage.request.post("/api/admin/webhooks", {
      data: { url: `https://example.com/e2e-permissions-test-${Date.now()}`, events: ["order_created"] },
    });
    expect(res.status()).toBe(201);
  });

  test("Staff: نفس إجراء إنشاء webhook المقتصر على المالك ← 403", async ({ staffPage }) => {
    const res = await staffPage.request.post("/api/admin/webhooks", {
      data: { url: `https://example.com/e2e-permissions-test-staff-${Date.now()}`, events: ["order_created"] },
    });
    expect(res.status()).toBe(403);
  });

  test("Staff: إجراء إداري عادي مسموح للجميع (عرض قائمة الطلبات) ← 200", async ({ staffPage }) => {
    const res = await staffPage.request.get("/api/admin/orders?page=1&pageSize=5");
    expect(res.status()).toBe(200);
  });

  test("بلا جلسة إطلاقًا: أي طلب لمسار إداري محمي ← 401", async ({ request }) => {
    const res = await request.get("/api/admin/orders?page=1&pageSize=5");
    expect(res.status()).toBe(401);
  });
});

// يُشغَّل هذا الوصف أخيرًا فالملف عمدًا — وليس بعد اختبار الدخول الصحيح مباشرة كما كان
// سابقًا. السبب المُكتشَف فعليًا: Supabase الدخول signOut() بلا خيارات يستعمل
// scope: 'global' افتراضيًا — يُبطل كل جلسات ذلك المستخدم أينما كانت، وليس فقط الجلسة/
// السياق الذي استدعاها. حتى مع دخول مستقل تمامًا (سياق متصفح منفصل، كويكيز منفصلة) لهذا
// الاختبار، الخروج هنا يُبطل جلسة ownerPage المشتركة بنطاق worker أيضًا لأنهما لنفس حساب
// Owner الحقيقي — ما كان يُسقط اختبار "Owner: إنشاء webhook" أعلاه زورًا بـ401 بدل 201 لو
// شُغِّل الخروج قبله. لا يوجد ownerPage/staffPage مُستخدَم بعد هذا الاختبار (لا فهذا
// الملف ولا فأي ملف لاحق أبجديًا)، فوضعه هنا آمن تمامًا.
test.describe("الخروج @desktop-only", () => {
  test("خروج: الجلسة تُمسَح فعليًا ومحاولة الوصول للوحة التحكم تُعيد للدخول", async ({ page }) => {
    await page.goto("/admin/login");
    await page.getByTestId("login-email").fill(E2E_OWNER_EMAIL);
    await page.getByTestId("login-password").fill(E2E_OWNER_PASSWORD);
    await page.getByTestId("login-submit").click();
    await page.waitForURL(/\/admin\/?(\?.*)?$/, { timeout: 15_000 });

    await page.getByTestId("admin-logout").click();
    await page.waitForURL(/\/admin\/login\/?(\?.*)?$/, { timeout: 10_000 });

    // محاولة الوصول مباشرة لصفحة محمية بعد الخروج يجب أن تُعيد التوجيه للدخول (لا جلسة صالحة).
    await page.goto("/admin/orders");
    await page.waitForURL(/\/admin\/login/, { timeout: 10_000 });
  });
});
