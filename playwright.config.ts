import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { defineConfig, devices } from "@playwright/test";

const PORT = 3500;
const BASE_URL = `http://localhost:${PORT}`;

// المتطلب: تشغيل الاختبارات على Production build حقيقي (build + start)، وليس dev server —
// next build يشمل بالفعل prisma migrate deploy (راجع package.json)، آمن التكرار.
// E2E_TEST_RUN=1 يُمرَّر فقط لهذه العملية المحلية المؤقتة (وليس أبدًا لبيئة الإنتاج
// الفعلية على Vercel) — راجع src/lib/e2eGuard.ts لتفاصيل ما يمنعه هذا العلم.
export default defineConfig({
  testDir: "./tests/e2e",
  // rate-limit-429.spec.ts مُستثنى من التشغيل الافتراضي عمدًا — يُغرق حد معدّل حقيقي مشترَك
  // بنفس IP لمدة 10 دقائق كاملة، فيُفسد أي اختبار كوبون شرعي آخر يعمل بعده فنفس التشغيلة
  // (مُكتَشف فعليًا، راجع التعليق داخل الملف نفسه). يُشغَّل بأمر منفصل بعد كل شيء آخر —
  // راجع tests/e2e/README.md و.github/workflows/e2e.yml. ملاحظة: testIgnore يستثني الملف
  // من الاكتشاف حتى لو مُرِّر مساره صراحةً بسطر الأوامر (تحقَّقنا فعليًا: "No tests found")
  // — لذا الاستثناء مشروط بمتغيّر بيئة بدل ثابت دائمًا، ليبقى ممكنًا استهداف الملف صراحةً
  // بضبط INCLUDE_RATE_LIMIT_TEST=1.
  testIgnore: process.env.INCLUDE_RATE_LIMIT_TEST === "1" ? undefined : /rate-limit-429\.spec\.ts/,
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  fullyParallel: false, // بيانات الاختبار تتشارك نفس قاعدة الإنتاج (عزل منطقي) — التوازي الكامل يرفع خطر تضارب سباق غير مقصود بين ملفات الاختبار المختلفة
  forbidOnly: !!process.env.CI,
  // 0 عمدًا حتى فCI (لا 1 الافتراضية): اكتُشف فعليًا على GitHub Actions حقيقي أن retries:1
  // يُضاعف خطر تجاوز حد معدّل الدخول الحقيقي الصارم (5/15 دقيقة — راجع
  // src/lib/rateLimit/upstash.ts وpermissions.spec.ts) — أي فشل عابر لاختبار يعتمد على
  // ownerPage/staffPage يُعيد Playwright تشغيله، وقد يُعيد تسجيل الدخول فعليًا (worker جديد)،
  // فيتجاوز الحد بسهولة. المجموعة هنا حتمية أصلًا (61/61 تنجح باستمرار محليًا)، فلا حاجة
  // فعلية لإعادة محاولة تُخفي عدم استقرار — وإعادة المحاولة هنا تُسبِّب فشلًا حقيقيًا بدل
  // إخفائه.
  retries: 0,
  workers: 1,
  reporter: [
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["list"],
    ["json", { outputFile: "playwright-report/results.json" }],
  ],
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"] } },
    // @desktop-only مُستثناة هنا: اختبارات الدخول/الصلاحيات/رموز الحالة الخادمية تعتمد على
    // دخول إداري حقيقي محدود بحد معدّل صارم (5/15 دقيقة لكل IP — راجع
    // src/lib/rateLimit/upstash.ts)، ومنطقها خادمي بحت غير حساس لمحرّك المتصفح؛ تشغيلها على
    // الثلاثة مشاريع كان يستنفد الحد فعليًا بلا أي قيمة تغطية إضافية حقيقية. تبقى مُشغَّلة
    // مرة واحدة فقط عبر chromium-desktop أعلاه؛ رحلة الشراء وسباقات التزامن (وهي حساسة
    // لمحرّك المتصفح/العرض الحقيقي) تبقى مُغطاة بالكامل على الثلاثة مشاريع دون استثناء.
    { name: "mobile-chrome", use: { ...devices["Pixel 5"] }, grepInvert: /@desktop-only/ },
    // WebKit: غير مستقر محليًا فهذه البيئة تحديدًا — تشخيص فعلي أثبت أن browserType.launch()
    // الخام ناجح دائمًا (سكربت منفصل مباشر)، لكن التشغيل عبر عامل اختبار Playwright الفعلي
    // (npx playwright test) يفشل بثبات 100% بـ"browserContext.newPage: Target page, context
    // or browser has been closed" خلال أقل من ثانية من الإطلاق — على الأرجح تعارض قناة
    // اتصال (--inspector-pipe) خاص بـWindows فعملية العامل الداخلية لـPlaywright، وليس مشكلة
    // فتطبيق Store DZ نفسه (تحقَّق: نفس السلوك تحت PowerShell الأصلي، فليس تعارض Git-Bash).
    // يبقى مُدرَجًا هنا لأن CI يعمل على Linux (بيئة مختلفة جوهريًا لبنية WebKit فPlaywright)
    // حيث يُتوقَّع نجاحه فعليًا — لكنه يبقى غير مُتحقَّق محليًا حتى تأكيد ذلك عبر CI. Firefox
    // مُستبعَد تمامًا (لا حتى فCI) لأنه فشل بإطلاق خام أساسي محليًا (مكتبة نظام Windows
    // مفقودة: msvcp140_1.dll) — قيد بيئة أضعف من قيد WebKit، وغير مؤكَّد النجاح حتى على Linux.
    { name: "webkit-desktop", use: { ...devices["Desktop Safari"] }, grepInvert: /@desktop-only/ },
  ],
  // "npm run start" (next start) لا يعمل بشكل سليم مع output: "standalone" — Next.js نفسه
  // يحذّر من هذا فسجلات التشغيل. نبني ثم نشغّل خادم standalone الحقيقي مباشرة (نفس ما يُشحَن
  // فعليًا عبر Docker)، بدل الاعتماد على "next start" فبيئة اختبار لا تعكس الإنتاج الفعلي.
  webServer: {
    command: "npm run build && node scripts/start-e2e-server.mjs",
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 180_000,
    // pipe (بدل الإهمال الافتراضي): بدونه console.error فخادم Next (مثل سبب فشل دخول حقيقي
    // فauthService.ts) لا يظهر إطلاقًا فسجلات CI — اكتُشف فعليًا أن هذا كان يُخفي السبب
    // الحقيقي وراء فشل اختبارات الدخول أكثر من مرة.
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      E2E_TEST_RUN: "1",
      PORT: String(PORT),
      // Docker يضبط HOSTNAME=<container-id> تلقائيًا داخل أي حاوية (راجع "container:" فـ
      // e2e.yml) — و...process.env أعلاه يمرّره كما هو لخادم standalone. قالب Next.js
      // القياسي (.next/standalone/server.js) يستمع فعليًا على `process.env.HOSTNAME ||
      // "0.0.0.0"`، فبدل الاستماع على كل الواجهات يستمع تحديدًا على اسم مضيف الحاوية —
      // الذي يُحلّ لعنوان الشبكة الجسرية الداخلي لها وليس 127.0.0.1/localhost. النتيجة
      // الفعلية المُلاحَظة: الخادم يطبع "✓ Ready" فعليًا لكن فحص الجهوزية هنا (BASE_URL على
      // localhost) لا يصل إليه أبدًا فيُنتظر حتى انتهاء المهلة (180 ثانية). الإصلاح: نتجاوز
      // القيمة الموروثة من Docker صراحةً بعد الانتشار (spread) أعلاه ليستمع على كل الواجهات
      // كما كان يحدث دائمًا خارج حاوية Docker (حيث HOSTNAME لا يشير لعنوان شبكة داخلي مماثل).
      HOSTNAME: "0.0.0.0",
    } as Record<string, string>,
  },
});
