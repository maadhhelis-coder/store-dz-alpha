// next.config.ts يفرض output: "standalone" (مطلوب لصورة Docker — راجع next.config.ts).
// Next.js نفسه يحذّر صراحة: "next start" لا يعمل بشكل سليم مع هذا الإعداد؛ الطريقة الصحيحة
// هي تشغيل .next/standalone/server.js مباشرة، بعد نسخ public/ و.next/static يدويًا بجانبه
// (server.js standalone لا يتضمنهما تلقائيًا — نفس النمط المستعمل حرفيًا فـDockerfile هنا).
//
// اكتُشف فعليًا: تشغيل Playwright E2E عبر "next start" (رغم التحذير أعلاه) كان يُنتج فشلًا
// متقطعًا حقيقيًا فطلبات fetch الخادمية نحو Supabase Auth ("Unexpected end of JSON input")
// و"Error: The destination stream closed early" — يختفيان بعد التبديل لخادم standalone
// الحقيقي، وهو نفسه ما يُشحَن فعليًا عبر Docker/الإنتاج.

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

const child = spawn(process.execPath, [path.join(standaloneDir, "server.js")], {
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code) => process.exit(code ?? 1));
