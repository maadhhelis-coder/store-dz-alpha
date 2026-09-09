import { defineConfig } from "vitest/config";
import path from "path";

// اختبارات التكامل للـCRM — تتطلب TEST_DATABASE_URL (قاعدة اختبار مخصصة فقط،
// محلية أو خدمة postgres في CI؛ لا قاعدة الإنتاج إطلاقًا). عند غيابه تتخطى
// الاختبارات نفسها بصوت واضح (skipBeforeAll في كل ملف اختبار).
// منفصلة تمامًا عن vitest.config.ts (unit — بلا DB) وعن Playwright (E2E).

export default defineConfig({
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    globals: false,
    // قبل أي استيراد لوحدة تلمس القاعدة: TEST_DATABASE_URL يصبح DATABASE_URL
    // الذي يقرؤه prisma singleton (src/server/db/prisma.ts) — عزل صريح عن أي
    // DATABASE_URL آخر قد يكون مضبوطًا في البيئة المحيطة.
    setupFiles: ["./tests/integration/support/setup.ts"],
    // ملف واحد في كل مرة. السبب ليس البطء بل الصحّة: صندوق الأحداث مشترك على
    // مستوى القاعدة، و drainOutbox يصرّف *كل* حدث معلّق لا أحداث ملفه فقط. مع
    // التوازي كان outbox-drain.test.ts يلتقط shipment.created الخاص بـ
    // shipment-lifecycle.test.ts فيُعالَج بمُحاكي الناقل الخاص بذلك الملف الآخر،
    // فيرى ملف الشحن الحدث «processed» وعدّاد نداءات ناقله صفرًا
    // (AssertionError: expected +0 to be 1 — فشل CI الفعلي على PR #66).
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
