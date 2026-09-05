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
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
