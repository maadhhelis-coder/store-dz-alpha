import type { Metadata } from "next";
import Breadcrumbs from "@/components/shared/Breadcrumbs";
import SectionHeading from "@/components/shared/SectionHeading";
import { SITE_NAME } from "@/data/site";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "عن المتجر",
  description: `تعرّف على ${SITE_NAME} — بوابتك الجديدة للتسوق الإلكتروني بشكل سهل وبسيط.`,
  path: "/about",
});

export default function AboutPage() {
  return (
    <div className="container-page py-10 md:py-14 max-w-3xl">
      <Breadcrumbs items={[{ name: "عن المتجر", path: "/about" }]} />

      <SectionHeading as="h1" eyebrow="تعرّف علينا" title="عن المتجر" className="mt-6" />

      <div className="space-y-4 text-cream-dim leading-relaxed">
        <p>هذا المتجر بوابتك الجديدة للتسوق إلكترونيا بشكل سهل وبسيط.</p>
        <p>
          نوفر لك منتجات متعددة ذات جودة عالية لتختار منها الأفضل وبسعر تنافسي لن تجده في أي
          مكان أخر. التسوق معنا عملية ممتعة وأمنة. ونوفر لك كل ما تحتاجه من التسهيلات سواء في
          اختيار المنتج أو في عملية الدفع أو في عملية الشحن.
        </p>
      </div>
    </div>
  );
}
