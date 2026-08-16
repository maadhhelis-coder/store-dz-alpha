import Link from "next/link";
import { ChevronRight, ChevronLeft } from "lucide-react";

type StorefrontPaginationProps = {
  page: number;
  pageSize: number;
  total: number;
  basePath: string;
  // معاملات إضافية تُحفظ فرابط كل صفحة (مثلاً ?category=slug) عدا page نفسها.
  extraParams?: Record<string, string>;
};

// مبني على روابط حقيقية (next/link) بدل onClick — فيصبح التنقل بين الصفحات قابلاً للزحف
// والفهرسة (SEO)، ويعمل حتى بلا جافاسكريبت، خلافًا لنسخة لوحة التحكم المبنية على state.
export default function StorefrontPagination({
  page,
  pageSize,
  total,
  basePath,
  extraParams = {},
}: StorefrontPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  function hrefFor(targetPage: number) {
    const params = new URLSearchParams(extraParams);
    if (targetPage > 1) params.set("page", String(targetPage));
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }

  return (
    <nav
      aria-label="التنقل بين صفحات المنتجات"
      className="flex items-center justify-center gap-3 mt-10 text-sm text-cream-dim"
    >
      {page > 1 ? (
        <Link
          href={hrefFor(page - 1)}
          aria-label="الصفحة السابقة"
          className="p-2 rounded-lg border border-gold/25 hover:border-gold transition-colors"
        >
          <ChevronRight className="w-4 h-4 icon-flip" />
        </Link>
      ) : (
        <span className="p-2 rounded-lg border border-gold/10 opacity-30">
          <ChevronRight className="w-4 h-4 icon-flip" />
        </span>
      )}

      <span className="text-xs">
        صفحة {page} من {totalPages}
      </span>

      {page < totalPages ? (
        <Link
          href={hrefFor(page + 1)}
          aria-label="الصفحة التالية"
          className="p-2 rounded-lg border border-gold/25 hover:border-gold transition-colors"
        >
          <ChevronLeft className="w-4 h-4 icon-flip" />
        </Link>
      ) : (
        <span className="p-2 rounded-lg border border-gold/10 opacity-30">
          <ChevronLeft className="w-4 h-4 icon-flip" />
        </span>
      )}
    </nav>
  );
}
