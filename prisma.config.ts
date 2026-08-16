import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";

config({ path: ".env.local" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "node --import tsx prisma/seed.ts",
  },
  // الـCLI (migrate/generate/studio/db execute) يستعمل DIRECT_URL حصرًا — اتصال session
  // pooler (منفذ 5432) يدعم advisory locks بشكل صحيح، بعكس transaction pooler (منفذ 6543)
  // الذي يُستعمل في DATABASE_URL وقت التشغيل الفعلي (src/server/db/prisma.ts يقرأه مباشرة،
  // بمعزل تام عن هذا الملف). تبديل هذا السطر لا يغيّر سلوك التطبيق إطلاقًا — فقط اتصال الـCLI.
  datasource: {
    url: env("DIRECT_URL"),
  },
});
