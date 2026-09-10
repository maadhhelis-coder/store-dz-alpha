import { beforeAll, describe, expect, it } from "vitest";

// المنقّي يقرأ NEXT_PUBLIC_SUPABASE_URL وقت الاستيراد، فيُضبط قبله.
const STORAGE = "https://example-project.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_URL = STORAGE;

let sanitizeProductHtml: (html: string) => string;

beforeAll(async () => {
  ({ sanitizeProductHtml } = await import("@/lib/sanitizeHtml"));
});

const own = `${STORAGE}/storage/v1/object/public/product-images/a/b.jpeg`;

// الصور صارت مسموحة داخل الوصف (إضافة من اللوحة)، لكن من مخزن المتجر حصرًا:
// أي مضيف آخر يحوّل الوصف إلى قناة لتحميل موارد خارجية — بكسل تتبّع خفي أو
// تسريب IP كل زائر إلى خادم لا نتحكّم فيه.
describe("sanitizeProductHtml — الصور", () => {
  it("يُبقي صورة من مخزن المتجر", () => {
    const out = sanitizeProductHtml(`<p>وصف</p><img src="${own}" alt="صورة">`);
    expect(out).toContain(`src="${own}"`);
    expect(out).toContain("<img");
  });

  it("يُسقط صورة من أي مضيف آخر", () => {
    for (const bad of [
      "https://evil.example/pixel.gif",
      "https://cdn.jsdelivr.net/x.png",
      `https://example-project.supabase.co.evil.com/storage/v1/object/public/x.png`,
    ]) {
      const out = sanitizeProductHtml(`<img src="${bad}">`);
      expect(out).not.toContain("<img");
      expect(out).not.toContain(bad);
    }
  });

  it("يُسقط المخططات غير https (data/javascript)", () => {
    for (const bad of ['data:image/svg+xml,<svg onload=alert(1)>', "javascript:alert(1)"]) {
      const out = sanitizeProductHtml(`<img src="${bad}">`);
      expect(out).not.toContain("alert");
    }
  });

  it("لا يسمح بسمات أخرى على الصورة (onerror مثلًا)", () => {
    const out = sanitizeProductHtml(`<img src="${own}" onerror="alert(1)" srcset="x">`);
    expect(out).not.toContain("onerror");
    expect(out).not.toContain("srcset");
  });

  it("الروابط تبقى ممنوعة كما كانت", () => {
    const out = sanitizeProductHtml(`<a href="https://evil.example">نص</a>`);
    expect(out).not.toContain("<a");
    expect(out).toContain("نص");
  });
});
