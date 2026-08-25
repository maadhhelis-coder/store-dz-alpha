import type { Metadata } from "next";
import Breadcrumbs from "@/components/shared/Breadcrumbs";
import SectionHeading from "@/components/shared/SectionHeading";
import { SITE_NAME } from "@/data/site";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "طرق الدفع",
  description: `طرق الدفع المتاحة في ${SITE_NAME} — الدفع نقداً عند الاستلام (COD).`,
  path: "/payment-methods",
});

export default function PaymentMethodsPage() {
  return (
    <div className="container-page py-10 md:py-14 max-w-3xl">
      <Breadcrumbs items={[{ name: "طرق الدفع", path: "/payment-methods" }]} />

      <SectionHeading as="h1" eyebrow="ادفع بأمان" title="طرق الدفع" className="mt-6" />

      <div className="space-y-8 text-cream-dim leading-relaxed">
        <section>
          <h2 className="text-cream font-display font-semibold text-lg mb-2">
            الدفع نقداً عند الاستلام (COD)
          </h2>
          <p>
            الدفع عند الاستلام (Cash On Delivery) هي إحدى طرق الدفع المتاحة على متجرنا، والدفع
            عند الاستلام يعني أن المتسوق يمكنه التسوق عبر متجرنا إلكتروني واختيار المنتج الذي
            يرغب فيه ومن ثم يقوم بإجراء الطلب واختيار طريقة الدفع عند الاستلام وهو ما يعني أن
            عملية الدفع تؤجل حتى استلام العميل للمنتج الذي قام بطلبه إلكترونيًا.
          </p>
          <p className="mt-3">
            وسنقوم بإرسال المنتج إلى المكان المتفق عليه (المدينة أو الحي أو المنزل أو مكان
            اخر)، وبعدها يتم الدفع.
          </p>
        </section>
      </div>
    </div>
  );
}
