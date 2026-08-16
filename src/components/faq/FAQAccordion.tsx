import { ChevronDown } from "lucide-react";
import JsonLd from "@/components/shared/JsonLd";
import { faqPageJsonLd } from "@/lib/seo";
import type { FAQItem } from "@/data/faq";

type FAQAccordionProps = {
  items: FAQItem[];
  withJsonLd?: boolean;
};

// details/summary الأصلية فـHTML بدل useState — تعطي نفس تجربة الطي/الفرد بلا أي
// جافاسكريبت على المتصفح، وتُبقي كل الأسئلة/الأجوبة فالـHTML من البداية (أفضل لمحركات
// البحث من محتوى يظهر فقط بعد تفاعل عميل، وتعمل حتى بلا JS إطلاقًا).
export default function FAQAccordion({ items, withJsonLd = false }: FAQAccordionProps) {
  return (
    <div className="divide-y divide-gold/10">
      {withJsonLd && <JsonLd data={faqPageJsonLd(items)} />}
      {items.map((item, index) => (
        <details key={item.id} className="group py-4" open={index === 0}>
          <summary className="w-full flex items-center justify-between gap-4 text-start cursor-pointer list-none marker:content-none [&::-webkit-details-marker]:hidden">
            <span className="font-semibold text-cream">{item.question}</span>
            <ChevronDown className="w-5 h-5 text-gold shrink-0 transition-transform group-open:rotate-180" />
          </summary>
          <p className="text-sm text-cream-dim leading-relaxed mt-3">{item.answer}</p>
        </details>
      ))}
    </div>
  );
}
