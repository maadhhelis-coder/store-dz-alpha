import type { FaqItem } from "@/data/faq";
import type { Product } from "@/data/products";
import { formatPrice } from "@/lib/format";

// ملفات اكتشاف محركات الذكاء الاصطناعي (ChatGPT / Perplexity / Claude): llms.txt وsummary.json
// وFAQPage. كلها مبنية من بيانات المتجر الحقيقية (المنتجات من القاعدة + أسئلة /faq) — لا نص مخترع.
// دوال نقية بلا Next/Prisma حتى تُختبر مباشرة.

type SiteInfo = { name: string; url: string; tagline: string; whatsapp: string; wilayaCount: number };

const INFO_PAGES = [
  { path: "/faq", title: "الأسئلة الشائعة" },
  { path: "/shipping-delivery", title: "الشحن والتسليم" },
  { path: "/payment-methods", title: "طرق الدفع" },
  { path: "/return-policy", title: "سياسة الاستبدال والاسترجاع" },
  { path: "/contact", title: "تواصل معنا" },
] as const;

// llms.txt حسب llmstxt.org: عنوان H1، ملخص بعد >، ثم أقسام روابط "- [عنوان](رابط): وصف".
export function buildLlmsTxt(site: SiteInfo, products: Pick<Product, "name" | "slug" | "price" | "shortDescription" | "inStock">[]): string {
  const lines = [
    `# ${site.name}`,
    "",
    `> ${site.tagline}. متجر جزائري، الدفع عند الاستلام، توصيل إلى ${site.wilayaCount} ولاية خلال 1 إلى 3 أيام عادة.`,
    "",
    "## المنتجات",
    "",
    ...products
      .filter((p) => p.inStock)
      .map((p) => `- [${p.name}](${site.url}/products/${p.slug}/): ${formatPrice(p.price)} — ${p.shortDescription}`.trim()),
    "",
    "## معلومات الشراء",
    "",
    ...INFO_PAGES.map((page) => `- [${page.title}](${site.url}${page.path}/)`),
    "",
    "## التواصل",
    "",
    `- واتساب: ${site.whatsapp}`,
    "",
  ];
  return lines.join("\n");
}

export function buildAiSummary(site: SiteInfo, productCount: number) {
  return {
    name: site.name,
    url: site.url,
    description: site.tagline,
    country: "DZ",
    language: "ar",
    currency: "DZD",
    payment: ["cash_on_delivery"],
    delivery: { coverage_wilayas: site.wilayaCount, typical_days: "1-3" },
    contact: { whatsapp: site.whatsapp },
    products_published: productCount,
    llms_txt: `${site.url}/llms.txt`,
    faq: `${site.url}/ai/faq.json`,
  };
}

export function faqJsonLd(items: readonly FaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}
