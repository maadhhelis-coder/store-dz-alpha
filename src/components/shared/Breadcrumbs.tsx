import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import JsonLd from "@/components/shared/JsonLd";
import { breadcrumbJsonLd } from "@/lib/seo";

type Crumb = {
  name: string;
  path: string;
};

type BreadcrumbsProps = {
  items: Crumb[];
};

export default function Breadcrumbs({ items }: BreadcrumbsProps) {
  const allItems: Crumb[] = [{ name: "الرئيسية", path: "/" }, ...items];

  return (
    <>
      <JsonLd data={breadcrumbJsonLd(allItems)} />
      <nav aria-label="مسار التصفح" className="text-sm text-cream-dim">
        <ol className="flex flex-wrap items-center gap-1.5">
          {allItems.map((item, index) => {
            const isLast = index === allItems.length - 1;
            return (
              <li key={item.path} className="flex items-center gap-1.5">
                {index > 0 && (
                  <ChevronLeft className="w-3.5 h-3.5 icon-flip text-cream-dim/80" />
                )}
                {isLast ? (
                  <span className="text-gold">{item.name}</span>
                ) : (
                  <Link href={item.path} className="hover:text-gold transition-colors">
                    {item.name}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </>
  );
}
