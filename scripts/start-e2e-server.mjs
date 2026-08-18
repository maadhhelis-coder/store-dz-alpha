// next.config.ts يفرض output: "standalone" (مطلوب لصورة Docker — راجع next.config.ts).
// Next.js نفسه يحذّر صراحة: "next start" لا يعمل بشكل سليم مع هذا الإعداد؛ الطريقة الصحيحة
// هي تشغيل .next/standalone/server.js مباشرة، بعد نسخ public/ و.next/static يدويًا بجانبه
// (server.js standalone لا يتضمنهما تلقائيًا — نفس النمط المستعمل حرفيًا فـDockerfile هنا).
//
// ملاحظة: "Unexpected end of JSON input" فمحاولات signInWithPassword كان سببه الحقيقي سرًّا
// مقتطعًا بحرف واحد (NEXT_PUBLIC_SUPABASE_URL)، وليس next start — تأكَّد ذلك بالتشخيص المباشر
// (301 من Cloudflare)، وأُصلح بإصلاح السر نفسه. "Error: The destination stream closed early"
// يظهر أحيانًا حتى مع الخادم الحقيقي هنا أيضًا (غير مرتبط بالتبديل)، ولا يرتبط بأي فشل اختبار
// فعلي لاحظناه — على الأرجح أثر جانبي حميد لطلب يُقطَع عمدًا فأحد مسارات الاختبار السلبية.

import { cpSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const standaloneDir = path.join(rootDir, ".next", "standalone");

if (!existsSync(standaloneDir)) {
  console.error(`[start-e2e-server] .next/standalone غير موجود — شغّل "next build" أولًا (${standaloneDir})`);
  process.exit(1);
}

cpSync(path.join(rootDir, "public"), path.join(standaloneDir, "public"), { recursive: true });
cpSync(path.join(rootDir, ".next", "static"), path.join(standaloneDir, ".next", "static"), { recursive: true });

// server.js (standalone) يستدعي process.chdir(__dirname) داخليًا فبدايته (تحقَّقنا فعليًا من
// محتوى .next/standalone/server.js المُولَّد) — أي أن CWD أثناء تشغيل التطبيق يصبح
// .next/standalone/ نفسها، وليس جذر المستودع. أي كود تطبيقي يبني مسارًا نسبيًا عبر
// process.cwd() (مثل src/lib/e2eNetworkGuard.ts) سينكسر بصمت بعد هذا الـchdir. نمرّر جذر
// المستودع الحقيقي صراحةً عبر متغيّر بيئة ليستعمله ذلك الكود بدل الاعتماد على process.cwd().
const child = spawn(process.execPath, [path.join(standaloneDir, "server.js")], {
  stdio: "inherit",
  env: { ...process.env, E2E_REPO_ROOT: rootDir },
});

child.on("exit", (code) => process.exit(code ?? 1));
