import { describe, expect, it } from "vitest";
import { cardImage } from "@/components/commerce/ProductCard";
import { productCreateSchema, productUpdateSchema } from "@/lib/validation/productSchema";

// صورة البطاقة تُضبط من خانة «صورة البطاقة» في لوحة التحكم (Product.cardImageUrl) وتظهر في
// قوائم المتجر فقط؛ صفحة المنتج تعرض المعرض. بلا صورة مخصصة ⇒ أول صورة من المعرض.
describe("cardImage", () => {
  it("uses the card image set in the dashboard", () => {
    expect(cardImage({ cardImage: "https://x.supabase.co/card.jpg", images: ["https://a/1.jpeg"] })).toBe(
      "https://x.supabase.co/card.jpg",
    );
  });
  it("falls back to the first gallery image when none is set (undefined or empty)", () => {
    expect(cardImage({ images: ["https://a/1.jpeg"] })).toBe("https://a/1.jpeg");
    expect(cardImage({ cardImage: "", images: ["https://a/1.jpeg"] })).toBe("https://a/1.jpeg");
  });
});

describe("cardImageUrl validation", () => {
  const partial = (cardImageUrl: unknown) => productUpdateSchema.safeParse({ cardImageUrl }).success;

  it("accepts an uploaded URL, the migrated static path, and null (clear)", () => {
    expect(partial("https://x.supabase.co/storage/v1/object/public/product-images/misc/a.jpeg")).toBe(true);
    // المسار الذي نقلته الـmigration من الكود — بدونه يُرفض حفظ المنتج الحالي من اللوحة
    expect(partial("/images/cards/pack-douche-robinet.jpg")).toBe(true);
    expect(partial(null)).toBe(true);
  });

  it("rejects paths outside /images and non-URLs", () => {
    expect(partial("/admin/x.jpg")).toBe(false);
    expect(partial("../../etc/passwd")).toBe(false);
    expect(partial("not a url")).toBe(false);
  });

  it("absent in a partial update ⇒ untouched (no default leaks in)", () => {
    const parsed = productUpdateSchema.parse({ name: "x" });
    expect("cardImageUrl" in parsed).toBe(false);
    expect(productCreateSchema.shape.cardImageUrl.isOptional()).toBe(true);
  });
});
