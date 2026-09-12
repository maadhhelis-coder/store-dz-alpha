import { describe, expect, it } from "vitest";
import { cardImage } from "@/components/commerce/ProductCard";

describe("cardImage", () => {
  it("uses the dedicated storefront card image when one exists for the slug", () => {
    expect(cardImage({ slug: "pack-douche-robinet", images: ["https://a/1.jpeg"] })).toBe("/images/cards/pack-douche-robinet.jpg");
  });
  it("falls back to the first product image", () => {
    expect(cardImage({ slug: "other", images: ["https://a/1.jpeg"] })).toBe("https://a/1.jpeg");
  });
});
