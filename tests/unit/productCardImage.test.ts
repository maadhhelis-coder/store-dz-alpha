import { describe, expect, it } from "vitest";
import { cardImage } from "@/components/commerce/ProductCard";

describe("cardImage", () => {
  it("prefers the first <img> in the description", () => {
    expect(cardImage({ longDescriptionHtml: '<p>x</p><img src="https://a/ad.jpeg"><img src="https://a/2.jpeg">', images: ["https://a/1.jpeg"] })).toBe("https://a/ad.jpeg");
  });
  it("falls back to the first product image", () => {
    expect(cardImage({ longDescriptionHtml: "<p>no image</p>", images: ["https://a/1.jpeg"] })).toBe("https://a/1.jpeg");
  });
});
