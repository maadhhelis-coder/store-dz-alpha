import type { Metadata } from "next";
import { notFound } from "next/navigation";
import JsonLd from "@/components/shared/JsonLd";
import ProductDetail from "@/components/commerce/ProductDetail";
import RelatedProducts from "@/components/commerce/RelatedProducts";
import { getPublishedProductBySlug, getRelatedProducts } from "@/lib/storefrontData";
import { buildMetadata, productJsonLd } from "@/lib/seo";
import { getSiteSettings } from "@/server/services/siteSettingsService";

type ProductPageProps = {
  params: Promise<{ slug: string }>;
};

// ملاحظة سابقة كانت هنا تفترض أن مجرد وجود generateStaticParams (حتى بإرجاع []) غير مؤثر لأن
// headers() فـ(storefront)/layout.tsx "يفرض" dynamic rendering على أي حال — هذا الافتراض خاطئ
// فعليًا: اكتُشف عبر E2E حقيقي أن /products/[slug] يبقى مصنَّفًا ● (SSG) فمخرجات البناء رغم
// ذلك، وأي طلب فعلي لصفحة منتج (بما فيها 404) كان يفشل بخطأ Server Components حقيقي
// (digest: DYNAMIC_SERVER_USAGE) لأن مجرد وجود الدالة يُفعّل مسار التوليد الساكن عند الطلب.
// إزالتها كليًا (بدل إرجاع []) هي الإصلاح الصحيح — dynamicParams الافتراضي (true) يبقي أي
// slug يعمل طبيعيًا وقت الطلب دون أي مسار توليد ساكن يُحاوَل إطلاقًا.

export async function generateMetadata({
  params,
}: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getPublishedProductBySlug(slug);
  if (!product) return {};

  return buildMetadata({
    title: product.name,
    description: product.shortDescription,
    path: `/products/${product.slug}`,
    image: product.images[0],
    type: "product",
  });
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const product = await getPublishedProductBySlug(slug);
  if (!product) notFound();

  const [related, settings] = await Promise.all([
    getRelatedProducts(product),
    getSiteSettings(),
  ]);

  // حشو سفلي يقابل الشريط الثابت أسفل الصفحة فلا يغطي آخر المحتوى
  return (
    // pb-28/32 السابقة أُزيلت: كانت تحاول تفادي الشريط الثابت من داخل {children}،
    // وهذا مستحيل أصلًا لأن الفوتر شقيق لاحق — فكل ما فعلته هو ترك 128px فراغًا بين
    // الأيقونات وشريط الروابط. التعويض الحقيقي صار على الفوتر نفسه (Footer.tsx).
    <div className="container-page pt-10 md:pt-14 pb-2 md:pb-3">
      <JsonLd data={productJsonLd(product)} />
      <div className="mt-6">
        <ProductDetail
          product={product}
          orderSettings={{
            thankYouMessage: settings.thankYouMessage,
            thankYouPageUrl: settings.thankYouPageUrl,
            privacyPolicyText: settings.privacyPolicyText,
          }}
        />
      </div>
      <RelatedProducts products={related} />
    </div>
  );
}
