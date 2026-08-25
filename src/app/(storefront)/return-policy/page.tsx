import type { Metadata } from "next";
import Breadcrumbs from "@/components/shared/Breadcrumbs";
import SectionHeading from "@/components/shared/SectionHeading";
import { SITE_NAME, WHATSAPP_DISPLAY } from "@/data/site";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "سياسة الاستبدال والاسترجاع",
  description: `سياسة الاستبدال والاسترجاع الخاصة بـ ${SITE_NAME} — ضمان استرداد الأموال خلال 48 ساعة.`,
  path: "/return-policy",
});

export default function ReturnPolicyPage() {
  return (
    <div className="container-page py-10 md:py-14 max-w-3xl">
      <Breadcrumbs items={[{ name: "سياسة الاستبدال والاسترجاع", path: "/return-policy" }]} />

      <SectionHeading
        as="h1"
        eyebrow="نضمن رضاك"
        title="سياسة الاستبدال والاسترجاع"
        className="mt-6"
      />

      <div className="space-y-8 text-cream-dim leading-relaxed">
        <section>
          <h2 className="text-cream font-display font-semibold text-lg mb-2">
            متى يحق لك الاستبدال أو الاسترجاع
          </h2>
          <p>
            إذا استلمت منتجًا به عيب مصنعي، أو غير مطابق لما طلبته، أو تضرر أثناء عملية
            الشحن، يحق لك طلب استبداله أو استرداد كامل المبلغ المدفوع، دون أي رسوم إضافية.
          </p>
        </section>

        <section>
          <h2 className="text-cream font-display font-semibold text-lg mb-2">المهلة الزمنية</h2>
          <p>
            لديك 48 ساعة من لحظة استلام طلبك للتواصل معنا والإبلاغ عن أي مشكلة في المنتج
            المستلم.
          </p>
        </section>

        <section>
          <h2 className="text-cream font-display font-semibold text-lg mb-2">
            خطوات الاستبدال أو الاسترجاع
          </h2>
          <ul className="list-disc pr-5 space-y-1.5">
            <li>تواصل معنا عبر واتساب على {WHATSAPP_DISPLAY} وأخبرنا برقم طلبك والمشكلة بالتحديد.</li>
            <li>عند الحاجة، نطلب منك صورة توضح العيب أو المشكلة لتسريع المعالجة.</li>
            <li>
              نتفق معك على استبدال المنتج بآخر سليم، أو استرداد كامل المبلغ إذا فضّلت ذلك.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-cream font-display font-semibold text-lg mb-2">ملاحظة مهمة</h2>
          <p>
            بما أن الدفع يكون عند الاستلام، لن تدفع أي شيء إلا بعد أن تتأكد بنفسك من المنتج —
            وهذا يقلل الحاجة للاسترجاع أصلًا، لكن إن حدث أي خلل بعد الاستلام فنحن هنا لحله معك.
          </p>
        </section>
      </div>
    </div>
  );
}
