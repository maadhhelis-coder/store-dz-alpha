import { ChevronRight, ChevronLeft } from "lucide-react";

type DataTablePaginationProps = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
};

export default function DataTablePagination({
  page,
  pageSize,
  total,
  onPageChange,
}: DataTablePaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between gap-4 py-4 text-sm text-cream-dim">
      <span>
        {from}–{to} من {total}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="p-1.5 rounded-lg border border-gold/25 disabled:opacity-60 hover:border-gold transition-colors"
          aria-label="الصفحة السابقة"
        >
          <ChevronRight className="w-4 h-4 icon-flip" />
        </button>
        <span className="text-xs">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="p-1.5 rounded-lg border border-gold/25 disabled:opacity-60 hover:border-gold transition-colors"
          aria-label="الصفحة التالية"
        >
          <ChevronLeft className="w-4 h-4 icon-flip" />
        </button>
      </div>
    </div>
  );
}
