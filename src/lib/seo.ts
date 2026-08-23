import type { Metadata } from "next";
import {
  FACEBOOK_URL,
  INSTAGRAM_URL,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_URL,
  WHATSAPP_DISPLAY,
  WHATSAPP_NUMBER,
} from "@/data/site";
import type { Product } from "@/data/products";

type BuildMetadataInput = {
  title: string;
  description: string;
  path: string; // e.g. "/products/wireless-earbuds"
  image?: string; // absolute or root-relative path
  type?: "website" | "article" | "product";
};

export function buildMetadata({
  title,
  description,
  path,
  image,
  type = "website",
}: BuildMetadataInput): Metadata {
  const url = `${SITE_URL}${path}`;
  const ogImage = image ? `${SITE_URL}${image}` : `${SITE_URL}/images/og/og-default.png`;

  return {
    title,
    description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      locale: "ar_DZ",
      type: type === "product" ? "website" : type,
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_TAGLINE,
    telephone: WHATSAPP_DISPLAY,
    contactPoint: {
      "@type": "ContactPoint",
      telephone: `+${WHATSAPP_NUMBER}`,
      contactType: "customer service",
      areaServed: "DZ",
      availableLanguage: ["ar"],
    },
    sameAs: [INSTAGRAM_URL, FACEBOOK_URL],
  };
}

// يُفعّل احتمال ظهور مربع بحث Google Sitelinks أسفل نتيجة البحث الرئيسية للموقع.
export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE_URL}/search?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

export function productJsonLd(product: Product) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.shortDescription,
    image: product.images.map((img) => `${SITE_URL}${img}`),
    sku: product.id,
    brand: { "@type": "Brand", name: "Store DZ" },
    offers: {
      "@type": "Offer",
      priceCurrency: "DZD",
      price: product.price,
      availability: product.inStock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      url: `${SITE_URL}/products/${product.slug}`,
    },
  };
}

export function faqPageJsonLd(items: { question: string; answer: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: `${SITE_URL}${item.path}`,
    })),
  };
}
