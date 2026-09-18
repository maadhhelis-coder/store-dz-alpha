import { describe, expect, it } from "vitest";
import { withTrailingSlash } from "@/app/(storefront)/sitemap";

// روابط الخريطة يجب أن تطابق الشكل المخدوم (شرطة ختامية) وإلا 308 لكل رابط.
describe("sitemap withTrailingSlash", () => {
  it("يضيف الشرطة مرة واحدة فقط", () => {
    expect(withTrailingSlash("https://storedz.one/products")).toBe("https://storedz.one/products/");
    expect(withTrailingSlash("https://storedz.one/")).toBe("https://storedz.one/");
  });
});
