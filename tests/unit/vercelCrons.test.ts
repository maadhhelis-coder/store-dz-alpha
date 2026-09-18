import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// التدقيق النهائي (FA-7): Vercel يستدعي مسار الـcron كما هو مكتوب في vercel.json بلا
// إعادة توجيه؛ مع trailingSlash: true كان "/api/cron/x" يُرد عليه بـ308 فلم تعمل أي مهمة
// مجدولة في الإنتاج قط (job_runs فارغ 13 يومًا). كل مسار cron يجب أن ينتهي بـ"/" ويطابق
// route.ts موجودًا وأن يكون محميًا بـverifyCronSecret.

const root = process.cwd();
const vercel = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8")) as { crons: { path: string; schedule: string }[] };
const nextConfig = readFileSync(join(root, "next.config.ts"), "utf8");

describe("vercel.json crons", () => {
  it("كل مسار cron ينتهي بشرطة مائلة عندما trailingSlash مفعّل، ويقابل route.ts محميًا", () => {
    expect(/trailingSlash:\s*true/.test(nextConfig)).toBe(true);
    expect(vercel.crons.length).toBeGreaterThan(0);
    for (const cron of vercel.crons) {
      expect(cron.path, cron.path).toMatch(/^\/api\/cron\/[a-z-]+\/$/);
      const route = join(root, "src/app", cron.path.slice(0, -1), "route.ts");
      expect(existsSync(route), route).toBe(true);
      expect(readFileSync(route, "utf8")).toContain("verifyCronSecret");
      expect(cron.schedule).toMatch(/^(\S+\s+){4}\S+$/);
    }
  });
});
