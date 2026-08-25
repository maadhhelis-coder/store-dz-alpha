import Link from "next/link";
import { ChevronDown } from "lucide-react";

type FooterAccordionColumnProps = {
  title: string;
  items: readonly { href: string; label: string }[];
};

// details/summary أصلي بدل بناء Accordion بحالة React — لا حاجة لتحويل Footer إلى Client
// Component فقط لأجل فتح/إغلاق قائمة، ويعمل بلا JavaScript أصلاً (تدهور بلا مشاكل).
export default function FooterAccordionColumn({ title, items }: FooterAccordionColumnProps) {
  return (
    <details className="group">
      <summary className="flex items-center justify-between cursor-pointer list-none font-display font-semibold text-gold py-1 [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown className="w-4 h-4 shrink-0 transition-transform duration-200 group-open:rotate-180" />
      </summary>
      <ul className="space-y-2 mt-4">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="text-sm text-cream-dim hover:text-gold transition-colors"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}
