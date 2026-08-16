import type { Metadata } from "next";
import Breadcrumbs from "@/components/shared/Breadcrumbs";
import SectionHeading from "@/components/shared/SectionHeading";
import FAQAccordion from "@/components/faq/FAQAccordion";
import WhatsAppButton from "@/components/shared/WhatsAppButton";
import JsonLd from "@/components/shared/JsonLd";
import { faqItems, getFaqByGroup, type FAQGroup } from "@/data/faq";
import { buildMetadata, faqPageJsonLd } from "@/lib/seo";
import { buildGenericMessage } from "@/lib/whatsapp";

export const metadata: Metadata = buildMetadata({
  title: "الأسئلة الشائعة",
  description:
    "إجابات على أكثر الأسئلة شيوعًا حول الطلب، التوصيل، الدفع عند الاستلام، الضمان، وسياسة الاسترجاع في Store DZ.",
  path: "/faq",
});

const GROUPS: { key: FAQGroup; label: string }[] = [
  { key: "ordering", label: "الطلب والتواصل" },
  { key: "shipping", label: "التوصيل" },
  { key: "payment", label: "الدفع" },
  { key: "returns", label: "الاسترجاع والضمان" },
  { key: "authenticity", label: "أصالة المنتجات" },
];

export default function FaqPage() {
  return (
    <div className="container-page py-10 md:py-14">
      <JsonLd data={faqPageJsonLd(faqItems)} />
      <Breadcrumbs items={[{ name: "الأسئلة الشائعة", path: "/faq" }]} />
      <SectionHeading
        as="h1"
        eyebrow="نحن هنا لمساعدتك"
        title="الأسئلة الشائعة"
        description="لم تجد إجابة سؤالك؟ تواصل معنا مباشرة عبر واتساب وسنجيبك في أقرب وقت."
        className="mt-6"
      />

      <div className="space-y-10 max-w-3xl">
        {GROUPS.map((group) => {
          const items = getFaqByGroup(group.key);
          if (items.length === 0) return null;
          return (
            <div key={group.key}>
              <h2 className="font-display font-semibold text-gold mb-2">
                {group.label}
              </h2>
              <FAQAccordion items={items} />
            </div>
          );
        })}
      </div>

      <div className="mt-10 rounded-xl gold-border bg-ink p-6 text-center max-w-3xl">
        <p className="text-cream mb-4">لم تجد إجابة سؤالك؟</p>
        <WhatsAppButton
          variant="pill"
          message={buildGenericMessage()}
          label="تواصل معنا عبر واتساب"
        />
      </div>
    </div>
  );
}
