import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { sweepAllE2EData, testPrisma } from "./support/testPrisma";

// يُشغَّل دائمًا بعد انتهاء كل الاختبارات (نجحت أو فشلت) — يضمن ألا تبقى أي بيانات E2E
// فقاعدة بيانات الإنتاج المشتركة، حتى لو تعطّل اختبار فمنتصف تنفيذه قبل تنظيف نفسه.
async function globalTeardown() {
  const result = await sweepAllE2EData();
  const total = Object.values(result).reduce((a, b) => a + b, 0);
  console.log(`\n[e2e-teardown] final cleanup — removed ${total} E2E-tagged row(s):`, result);
  await testPrisma.$disconnect();
}

export default globalTeardown;
