import type { Metadata } from "next";
import Breadcrumbs from "@/components/shared/Breadcrumbs";
import SectionHeading from "@/components/shared/SectionHeading";
import { SITE_NAME, WILAYA_COUNT } from "@/data/site";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "الشحن والتسليم",
  description: `كل ما تحتاج معرفته عن الشحن والتسليم في ${SITE_NAME} — توصيل لكل ولايات الجزائر.`,
  path: "/shipping-delivery",
});

export default function ShippingDeliveryPage() {
  return (
    <div className="container-page py-10 md:py-14 max-w-3xl">
      <Breadcrumbs items={[{ name: "الشحن والتسليم", path: "/shipping-delivery" }]} />

      <SectionHeading as="h1" eyebrow="طلبك في الطريق إليك" title="الشحن والتسليم" className="mt-6" />

      <div className="space-y-8 text-cream-dim leading-relaxed">
        <section>
          <h2 className="text-cream font-display font-semibold text-lg mb-2">مناطق التوصيل</h2>
          <p>
            نوصل طلباتك إلى {WILAYA_COUNT} ولاية عبر كامل التراب الوطني، سواء رغبت في استلام
            طلبك بمكتب التوصيل القريب منك أو استلامه مباشرة عند باب منزلك.
          </p>
        </section>

        <section>
          <h2 className="text-cream font-display font-semibold text-lg mb-2">مدة التوصيل</h2>
          <p>
            بعد تأكيد طلبك، يبدأ تحضيره وشحنه مباشرة عبر شركة توصيل معتمدة. مدة الوصول عادة
            تكون بين يوم إلى يومين، وقد تختلف قليلًا حسب الولاية والبلدية.
          </p>
        </section>

        <section>
          <h2 className="text-cream font-display font-semibold text-lg mb-2">متابعة الطلب</h2>
          <p>
            بمجرد شحن طلبك ستصلك رسالة تُعلمك بذلك، وعند وصوله لمكتب التوصيل أو مع عامل
            التوصيل ستصلك رسالة أخرى لتتابع طلبك خطوة بخطوة دون الحاجة للسؤال عنه.
          </p>
        </section>

        <section>
          <h2 className="text-cream font-display font-semibold text-lg mb-2">الدفع عند التسليم</h2>
          <p>
            الدفع يكون عند استلام الطلب فقط (الدفع عند الاستلام) — تتأكد من طلبك أولًا ثم تدفع
            ثمنه لعامل التوصيل مباشرة.
          </p>
        </section>
      </div>
    </div>
  );
}
