"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Eye, Loader2, Plus, Search, Trash2 } from "lucide-react";
import type { Funnel, Product, ProductImage } from "@prisma/client";
import DataTablePagination from "@/components/admin/DataTablePagination";
import { statusPillClass } from "@/components/shared/StatusPill";

const PAGE_SIZE = 20;

type FunnelRow = Funnel & { product: Product & { images: ProductImage[] } };

export default function FunnelsTable() {
  const [funnels, setFunnels] = useState<FunnelRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchFunnels = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (search.trim()) params.set("search", search.trim());

    try {
      const res = await fetch(`/api/admin/funnels?${params.toString()}`);
      const data = await res.json();
      setFunnels(data.items ?? []);
      setTotal(data.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    // جلب البيانات عند التحميل وعند تغيّر الفلاتر — نمط قياسي، الإنذار غير دقيق هنا.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchFunnels();
  }, [fetchFunnels]);

  async function handleDelete(id: string, title: string) {
    if (!window.confirm(`هل تريد حذف صفحة الهبوط "${title}"؟ لا يمكن التراجع عن هذا الإجراء.`)) return;
    await fetch(`/api/admin/funnels/${id}`, { method: "DELETE" });
    await fetchFunnels();
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute top-1/2 -translate-y-1/2 start-3 w-4 h-4 text-cream-dim" />
          <input
            type="text"
            placeholder="بحث بالعنوان"
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
            className="w-full rounded-lg bg-ink border border-gold/25 ps-9 pe-3 py-2 text-sm text-cream focus:outline-none focus:border-gold"
          />
        </div>
        <Link
          href="/admin/funnels/new"
          className="gold-gradient text-ink text-sm font-semibold px-4 py-2 rounded-lg flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> صفحة هبوط جديدة
        </Link>
      </div>

      <div className="rounded-xl gold-border bg-ink overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gold/15 text-cream-dim text-xs">
              <th scope="col" className="p-3 text-start">الصورة</th>
              <th scope="col" className="p-3 text-start">العنوان</th>
              <th scope="col" className="p-3 text-start">النوع</th>
              <th scope="col" className="p-3 text-start">المنتج</th>
              <th scope="col" className="p-3 text-start">الرابط</th>
              <th scope="col" className="p-3 text-start">المشاهدات</th>
              <th scope="col" className="p-3 text-start">الحالة</th>
              <th scope="col" className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-cream-dim">
                  <Loader2 className="w-5 h-5 animate-spin inline" />
                </td>
              </tr>
            ) : funnels.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-cream-dim">
                  لا توجد صفحات هبوط بعد
                </td>
              </tr>
            ) : (
              funnels.map((funnel) => (
                <tr key={funnel.id} className="border-b border-gold/10 last:border-0 hover:bg-black/30">
                  <td className="p-3">
                    <div className="w-10 h-10 rounded-lg overflow-hidden gold-border bg-black">
                      {(funnel.heroImageUrl || funnel.product.images[0]?.url) && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={funnel.heroImageUrl || funnel.product.images[0]?.url}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>
                  </td>
                  <td className="p-3 text-cream">{funnel.title}</td>
                  <td className="p-3">
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-gold/15 text-gold">
                      {funnel.pageType === "product_page" ? "صفحة منتج" : "صفحة هبوط"}
                    </span>
                  </td>
                  <td className="p-3 text-cream-dim">{funnel.product.name}</td>
                  <td className="p-3">
                    {funnel.isPublished ? (
                      <a
                        href={`/lp/${funnel.slug}/`}
                        target="_blank"
                        rel="noopener noreferrer"
                        dir="ltr"
                        className="text-gold text-xs hover:underline"
                      >
                        /lp/{funnel.slug}
                      </a>
                    ) : (
                      <span dir="ltr" className="text-cream-dim/80 text-xs">/lp/{funnel.slug}</span>
                    )}
                  </td>
                  <td className="p-3 text-cream-dim">
                    <span className="inline-flex items-center gap-1.5">
                      <Eye className="w-3.5 h-3.5" /> {funnel.views}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className={statusPillClass(funnel.isPublished ? "success" : "neutral")}>
                      {funnel.isPublished ? "منشورة" : "مسودة"}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      <Link href={`/admin/funnels/${funnel.id}`} className="text-gold text-xs hover:underline">
                        تعديل
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDelete(funnel.id, funnel.title)}
                        className="text-red-400 hover:text-red-300"
                        aria-label="حذف صفحة الهبوط"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <DataTablePagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
    </div>
  );
}
