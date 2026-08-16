import type { Metadata } from "next";
import Breadcrumbs from "@/components/shared/Breadcrumbs";
import SectionHeading from "@/components/shared/SectionHeading";
import { SITE_NAME, WHATSAPP_DISPLAY, WILAYA_COUNT } from "@/data/site";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "الشروط والأحكام",
  description: `الشروط والأحكام الخاصة بالتسوق والطلب من ${SITE_NAME}.`,
  path: "/terms-of-service",
});

export default function TermsOfServicePage() {
  return (
    <div className="container-page py-10 md:py-14 max-w-3xl">
      <Breadcrumbs items={[{ name: "الشروط والأحكام", path: "/terms-of-service" }]} />

      <SectionHeading as="h1" eyebrow="اتفاقية الاستخدام" title="الشروط والأحكام" className="mt-6" />

      <div className="space-y-8 text-cream-dim leading-relaxed">
        <section>
          <h2 className="text-cream font-display font-semibold text-lg mb-2">الطلب والتأكيد</h2>
          <p>
            عند تقديم طلب عبر {SITE_NAME}، يُعتبر الطلب مبدئيًا حتى يتم تأكيده عبر واتساب أو مكالمة هاتفية من
            فريقنا. يحق لك تعديل أو إلغاء الطلب قبل شحنه بالتواصل معنا.
          </p>
        </section>

        <section>
          <h2 className="text-cream font-display font-semibold text-lg mb-2">الدفع</h2>
          <p>
            نعتمد بشكل أساسي على الدفع عند الاستلام (COD) — تدفع فقط عند استلام طلبك والتأكد منه، بلا حاجة
            لأي بيانات دفع إلكتروني مسبقًا.
          </p>
        </section>

        <section>
          <h2 className="text-cream font-display font-semibold text-lg mb-2">التوصيل</h2>
          <p>
            نوصل الطلبات إلى {WILAYA_COUNT} ولاية عبر كامل التراب الوطني، عادة خلال يوم إلى يومين حسب
            الولاية، وتصلك رسالة أو مكالمة من فريق التوصيل قبل الوصول لتحديد الموعد المناسب.
          </p>
        </section>

        <section>
          <h2 className="text-cream font-display font-semibold text-lg mb-2">الاسترجاع والاستبدال</h2>
          <p>
            في حال وجود أي عيب أو عدم مطابقة في المنتج المستلم، تواصل معنا خلال 48 ساعة من الاستلام وسنقوم
            بالاستبدال أو استرداد كامل المبلغ دون أي تعقيد.
          </p>
        </section>

        <section>
          <h2 className="text-cream font-display font-semibold text-lg mb-2">المنتجات</h2>
          <p>
            جميع المنتجات المعروضة أصلية ومختارة بعناية من موردين موثوقين. قد تختلف الألوان الظاهرة قليلًا
            بسبب إعدادات الشاشة، وهذا لا يُعتبر عيبًا في المنتج.
          </p>
        </section>

        <section>
          <h2 className="text-cream font-display font-semibold text-lg mb-2">تواصل معنا</h2>
          <p>
            لأي استفسار يخص هذه الشروط، تواصل معنا عبر واتساب على {WHATSAPP_DISPLAY}.
          </p>
        </section>
      </div>
    </div>
  );
}
