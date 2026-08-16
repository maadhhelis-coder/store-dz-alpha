import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { sweepAllE2EData, testPrisma } from "./support/testPrisma";
import { ensureAdminFixtures } from "./support/adminFixtures";

// راجع tests/e2e/README.md لتفاصيل قرار عزل بيانات الاختبار (لا قاعدة بيانات منفصلة فعليًا
// بعد — Docker غير متاح فبيئة التطوير الحالية، ولا مشروع Supabase اختباري ثانٍ). هذا الحارس
// يمنع تشغيل الاختبارات بلا وعي كامل بأنها ستعمل على نفس قاعدة بيانات الإنتاج (بعزل منطقي
// صارم: بادئات/علامات مميّزة + تنظيف مضمون قبل وبعد كل تشغيل + حجب أي نداء شبكة خارجي حقيقي).
async function globalSetup() {
  const required = [
    "DATABASE_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`E2E setup: متغيرات بيئة مفقودة (${missing.join(", ")}) — راجع .env.local`);
  }

  process.env.E2E_RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  console.log("\n" + "=".repeat(78));
  console.log("⚠️  E2E RUNNING AGAINST THE SHARED PRODUCTION DATABASE (logical isolation only)");
  console.log(`    Run ID: ${process.env.E2E_RUN_ID}`);
  console.log("    All test data is tagged (slug/name prefix 'e2e-', phone range 0555xxxxxx,");
  console.log("    customer last name 'E2E-TestRun-*') and swept before + after this run.");
  console.log("    Real external calls (Meta CAPI, TikTok Events API, webhooks, DHD) are");
  console.log("    short-circuited via E2E_TEST_RUN=1 on the spawned test server process.");
  console.log("=".repeat(78) + "\n");

  // تنظيف احترازي لأي بقايا من تشغيل سابق تعطّل قبل تنظيف نفسه (self-healing).
  const preSweep = await sweepAllE2EData();
  const preSweepTotal = Object.values(preSweep).reduce((a, b) => a + b, 0);
  if (preSweepTotal > 0) {
    console.log(`[e2e-setup] cleaned up ${preSweepTotal} leftover row(s) from a previous run:`, preSweep);
  }

  await ensureAdminFixtures();
  console.log("[e2e-setup] owner/staff admin fixtures ready");

  await testPrisma.$disconnect();
}

export default globalSetup;
