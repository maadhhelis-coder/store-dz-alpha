"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Plus, Trash2 } from "lucide-react";
import type { Offer, Product, ProductImage } from "@prisma/client";
import DataTablePagination from "@/components/admin/DataTablePagination";
import { formatPrice } from "@/lib/format";
import { statusPillClass } from "@/components/shared/StatusPill";

const PAGE_SIZE = 20;

type OfferRow = Offer & {
  triggerProduct: Product & { images: ProductImage[] };
  offerProduct: Product & { images: ProductImage[] };
};

export default function OffersTable() {
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const fetchOffers = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });

    try {
      const res = await fetch(`/api/admin/offers?${params.toString()}`);
      const data = await res.json();
      setOffers(data.items ?? []);
      setTotal(data.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    // جلب البيانات عند التحميل وعند تغيّر الصفحة — نمط قياسي، الإنذار غير دقيق هنا.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchOffers();
  }, [fetchOffers]);

  async function handleDelete(id: string, title: string) {
    if (!window.confirm(`هل تريد حذف العرض "${title}"؟ لا يمكن التراجع عن هذا الإجراء.`)) return;
    await fetch(`/api/admin/offers/${id}`, { method: "DELETE" });
    await fetchOffers();
  }

  return (
    <div>
      <div className="flex items-center justify-end mb-4">
        <Link
          href="/admin/offers/new"
          className="gold-gradient text-ink text-sm font-semibold px-4 py-2 rounded-lg flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> عرض جديد
        </Link>
      </div>

      <div className="rounded-xl gold-border bg-ink overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gold/15 text-cream-dim text-xs">
              <th scope="col" className="p-3 text-start">العنوان</th>
              <th scope="col" className="p-3 text-start">عند طلب</th>
              <th scope="col" className="p-3"></th>
              <th scope="col" className="p-3 text-start">يُعرض عليه</th>
              <th scope="col" className="p-3 text-start">السعر الخاص</th>
              <th scope="col" className="p-3 text-start">الحالة</th>
              <th scope="col" className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-cream-dim">
                  <Loader2 className="w-5 h-5 animate-spin inline" />
                </td>
              </tr>
            ) : offers.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-cream-dim">
                  لا توجد عروض بعد
                </td>
              </tr>
            ) : (
              offers.map((offer) => (
                <tr key={offer.id} className="border-b border-gold/10 last:border-0 hover:bg-black/30">
                  <td className="p-3 text-cream">{offer.title}</td>
                  <td className="p-3 text-cream-dim">{offer.triggerProduct.name}</td>
                  <td className="p-3 text-cream-dim">
                    <ArrowLeft className="w-4 h-4 icon-flip" />
                  </td>
                  <td className="p-3 text-cream-dim">{offer.offerProduct.name}</td>
                  <td className="p-3">
                    <span className="text-gold font-semibold">{formatPrice(offer.offerPriceDzd)}</span>
                    <span className="text-cream-dim/50 line-through text-xs ms-2">
                      {formatPrice(offer.offerProduct.priceDzd)}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className={statusPillClass(offer.isActive ? "success" : "neutral")}>
                      {offer.isActive ? "مفعّل" : "معطّل"}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      <Link href={`/admin/offers/${offer.id}`} className="text-gold text-xs hover:underline">
                        تعديل
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDelete(offer.id, offer.title)}
                        className="text-red-400 hover:text-red-300"
                        aria-label="حذف العرض"
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
