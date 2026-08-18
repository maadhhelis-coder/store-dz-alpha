import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Breadcrumbs from "@/components/shared/Breadcrumbs";
import JsonLd from "@/components/shared/JsonLd";
import ProductDetail from "@/components/commerce/ProductDetail";
import RelatedProducts from "@/components/commerce/RelatedProducts";
import {
  getPublishedProductBySlug,
  getRelatedProducts,
  getCategoryBySlug,
} from "@/lib/storefrontData";
import { buildMetadata, productJsonLd } from "@/lib/seo";

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

  const [category, related] = await Promise.all([
    getCategoryBySlug(product.categorySlug),
    getRelatedProducts(product),
  ]);

  return (
    <div className="container-page py-10 md:py-14">
      <JsonLd data={productJsonLd(product)} />
      <Breadcrumbs
        items={[
          { name: "المنتجات", path: "/products" },
          ...(category
            ? [{ name: category.name, path: `/category/${category.slug}` }]
            : []),
          { name: product.name, path: `/products/${product.slug}` },
        ]}
      />
      <div className="mt-6">
        <ProductDetail product={product} />
      </div>
      <RelatedProducts products={related} />
    </div>
  );
}
