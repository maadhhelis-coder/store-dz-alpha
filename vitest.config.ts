import { defineConfig } from "vitest/config";
import path from "path";

// اختبارات unit/integration للـCRM — منفصلة تمامًا عن Playwright E2E القائم.
// unit: دوال صرفة بلا DB (phone، state machine، rbac catalog، redact، hashes).
// integration: تحتاج DATABASE_URL (تُشغَّل محليًا/CI فقط — انظر vitest.integration).

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
    globals: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
