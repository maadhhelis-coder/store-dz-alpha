import { describe, expect, it } from "vitest";
import { buildMetadata, productJsonLd } from "@/lib/seo";
import type { Product } from "@/data/products";

// اكتُشف على الإنتاج (Search Console — خطأ حرج «URL non valide dans le champ image»):
// صور المنتجات مخزَّنة في Supabase Storage فروابطها مطلقة، وكان يُلصق أمامها SITE_URL
// فينتج ‎https://storedz.onehttps//…‎ في og:image وفي JSON-LD معًا.
const product = {
  id: "p1",
  slug: "test-product",
  name: "منتج",
  shortDescription: "وصف",
  price: 1500,
  inStock: true,
  images: [
    "https://wgmfsizdtumonopipvmh.supabase.co/storage/v1/object/public/product-images/a/b.jpeg",
    "/images/products/local.jpg",
  ],
} as unknown as Product;

describe("productJsonLd", () => {
  const jsonLd = productJsonLd(product, { minDzd: 300, maxDzd: 1300 });

  it("لا يلصق SITE_URL أمام رابط مطلق، ويكمّل الرابط النسبي", () => {
    expect(jsonLd.image).toEqual([
      "https://wgmfsizdtumonopipvmh.supabase.co/storage/v1/object/public/product-images/a/b.jpeg",
      "https://storedz.one/images/products/local.jpg",
    ]);
    for (const url of jsonLd.image) expect(url).not.toContain("storedz.onehttps");
  });

  it("og:image كذلك (نفس الجذر — buildMetadata)", () => {
    const meta = buildMetadata({ title: "t", description: "d", path: "/products/test-product", image: product.images[0] });
    expect(meta.openGraph?.images).toEqual([
      { url: product.images[0], width: 1200, height: 630, alt: "t" },
    ]);
  });

  it("يحمل الحقلين اللذين طلبهما Search Console بقيم المتجر الحقيقية", () => {
    expect(jsonLd.offers.shippingDetails.shippingRate).toMatchObject({ minValue: 300, maxValue: 1300, currency: "DZD" });
    expect(jsonLd.offers.shippingDetails.shippingDestination.addressCountry).toBe("DZ");
    expect(jsonLd.offers.hasMerchantReturnPolicy).toMatchObject({
      applicableCountry: "DZ",
      merchantReturnDays: 2, // 48 ساعة في /return-policy
      returnFees: "https://schema.org/FreeReturn",
    });
  });
});
