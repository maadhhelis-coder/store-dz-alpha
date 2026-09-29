import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "../../middleware";

// رابط الإعلان بلا «/» يُخدَم مباشرة بإعادة كتابة داخلية (بلا 308) — والإدارة تبقى بالتحويلة.
describe("middleware: شرطة ختامية بلا تحويلة", () => {
  it("صفحة منتج بلا «/» مع utm: إعادة كتابة داخلية تحفظ المعلمات، لا 308", async () => {
    const res = await middleware(new NextRequest("https://storedz.one/products/x?utm_source=fb&utm_content=C1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-rewrite")).toBe("https://storedz.one/products/x/?utm_source=fb&utm_content=C1");
    expect(res.headers.get("Content-Security-Policy")).toContain("nonce-");
  });

  it("مسار الإدارة بلا «/»: تحويلة 308 كما كانت", async () => {
    const res = await middleware(new NextRequest("https://storedz.one/admin/orders"));
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("https://storedz.one/admin/orders/");
  });

  it("ملف بامتداد ومسار بـ«/» لا يُمَسّان", async () => {
    const withSlash = await middleware(new NextRequest("https://storedz.one/products/x/"));
    expect(withSlash.headers.get("x-middleware-rewrite")).toBeNull();
    const file = await middleware(new NextRequest("https://storedz.one/robots.txt"));
    expect(file.headers.get("x-middleware-rewrite")).toBeNull();
  });
});
