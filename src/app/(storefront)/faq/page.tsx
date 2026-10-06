import type { Metadata } from "next";
import Breadcrumbs from "@/components/shared/Breadcrumbs";
import SectionHeading from "@/components/shared/SectionHeading";
import JsonLd from "@/components/shared/JsonLd";
import { FAQ_ITEMS } from "@/data/faq";
import { SITE_NAME } from "@/data/site";
import { faqJsonLd } from "@/lib/aiDiscovery";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "الأسئلة الشائعة",
  description: `إجابات على أكثر الأسئلة شيوعًا حول الطلب والدفع والتوصيل في ${SITE_NAME}.`,
  path: "/faq",
});

export default function FaqPage() {
  return (
    <div className="container-page py-10 md:py-14 max-w-3xl">
      {/* FAQPage هنا فقط: Google يشترط أن يطابق المحتوى الظاهر في الصفحة نفسها */}
      <JsonLd data={faqJsonLd(FAQ_ITEMS)} />
      <Breadcrumbs items={[{ name: "الأسئلة الشائعة", path: "/faq" }]} />

      <SectionHeading as="h1" eyebrow="عندك سؤال؟" title="الأسئلة الشائعة" className="mt-6" />

      <div className="space-y-6">
        {FAQ_ITEMS.map((item) => (
          <div key={item.question} className="rounded-xl gold-border bg-ink p-5">
            <h2 className="text-cream font-display font-semibold text-base mb-2">
              {item.question}
            </h2>
            <p className="text-cream-dim text-sm leading-relaxed">{item.answer}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
