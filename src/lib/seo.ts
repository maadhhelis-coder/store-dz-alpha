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

// اكتُشف فعليًا (طلب صريح): كانت sameAs تعتمد ثوابت INSTAGRAM_URL/FACEBOOK_URL الثابتة فقط،
// بينما Header/Footer/MobileNav تعرض فعليًا روابط socialUrls المُعدَّة من لوحة التحكم (قد
// تختلف عن الثوابت)، ولا تتضمن TikTok إطلاقًا رغم عرضه فعليًا فالواجهة. هذا يُصحِّح ذلك:
// يقبل روابط socialUrls الحقيقية من DB (اختيارية)، ويسقط أي رابط غير مضبوط بدل إدراج قيمة
// فارغة/خاطئة. صحة sameAs هي الأساس التقني الوحيد الذي يمكن لصاحب الموقع التحكم فيه لدعم
// احتمال ظهور أيقونات التواصل الاجتماعي فنتيجة بحث جوجل — عرضها الفعلي قرار خوارزمي من جوجل
// نفسه، لا يضمنه أي كود.
export function organizationJsonLd(socialUrls?: {
  instagramUrl?: string | null;
  facebookUrl?: string | null;
  tiktokUrl?: string | null;
}) {
  const sameAs = [
    socialUrls?.instagramUrl || INSTAGRAM_URL,
    socialUrls?.facebookUrl || FACEBOOK_URL,
    socialUrls?.tiktokUrl,
  ].filter((url): url is string => Boolean(url));

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
    sameAs,
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
