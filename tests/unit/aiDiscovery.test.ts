import { describe, expect, it } from "vitest";
import { FAQ_ITEMS } from "@/data/faq";
import { buildAiSummary, buildLlmsTxt, faqJsonLd } from "@/lib/aiDiscovery";

const site = { name: "Store DZ", url: "https://storedz.one", tagline: "منتجات أصلية", whatsapp: "0562 84 88 12", wilayaCount: 69 };
const products = [
  { name: "جهاز تنظيف البانسو", slug: "brush-cleaner", price: 1800, shortDescription: "ينظّف في أقل من دقيقة", inStock: true },
  { name: "منتج نافد", slug: "sold-out", price: 999, shortDescription: "x", inStock: false },
];

describe("llms.txt", () => {
  it("يبدأ بعنوان H1 وملخص ويضع رابط كل منتج متوفر بسعره", () => {
    const txt = buildLlmsTxt(site, products);
    expect(txt.startsWith("# Store DZ\n\n> ")).toBe(true);
    expect(txt).toContain("- [جهاز تنظيف البانسو](https://storedz.one/products/brush-cleaner/): ");
    expect(txt).toContain("الدفع عند الاستلام");
  });

  it("لا يذكر منتجًا نافدًا (لا نوجّه الذكاء الاصطناعي لمنتج لا يُباع)", () => {
    expect(buildLlmsTxt(site, products)).not.toContain("sold-out");
  });
});

describe("summary.json و FAQPage", () => {
  it("summary يحمل الدفع عند الاستلام وعدد المنتجات", () => {
    const s = buildAiSummary(site, 2);
    expect(s.payment).toEqual(["cash_on_delivery"]);
    expect(s.products_published).toBe(2);
    expect(s.llms_txt).toBe("https://storedz.one/llms.txt");
  });

  it("FAQPage يطابق أسئلة صفحة /faq واحدًا بواحد", () => {
    const ld = faqJsonLd(FAQ_ITEMS);
    expect(ld["@type"]).toBe("FAQPage");
    expect(ld.mainEntity).toHaveLength(FAQ_ITEMS.length);
    expect(ld.mainEntity[0]).toEqual({
      "@type": "Question",
      name: FAQ_ITEMS[0].question,
      acceptedAnswer: { "@type": "Answer", text: FAQ_ITEMS[0].answer },
    });
  });
});
