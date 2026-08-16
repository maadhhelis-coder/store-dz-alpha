"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Plus, Search, Trash2 } from "lucide-react";
import type { Category, Product, ProductImage } from "@prisma/client";
import DataTablePagination from "@/components/admin/DataTablePagination";
import { formatPrice } from "@/lib/format";
import { statusPillClass } from "@/components/shared/StatusPill";

const PAGE_SIZE = 20;

type ProductRow = Product & { category: Category; images: ProductImage[] };

export default function ProductsTable({ categories }: { categories: Category[] }) {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (search.trim()) params.set("search", search.trim());
    if (categoryId) params.set("categoryId", categoryId);

    try {
      const res = await fetch(`/api/admin/products?${params.toString()}`);
      const data = await res.json();
      setProducts(data.items ?? []);
      setTotal(data.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [page, search, categoryId]);

  useEffect(() => {
    // جلب البيانات عند التحميل وعند تغيّر الفلاتر — نمط قياسي، الإنذار غير دقيق هنا.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchProducts();
  }, [fetchProducts]);

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`هل تريد حذف المنتج "${name}"؟ لا يمكن التراجع عن هذا الإجراء.`)) return;
    await fetch(`/api/admin/products/${id}`, { method: "DELETE" });
    await fetchProducts();
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute top-1/2 -translate-y-1/2 start-3 w-4 h-4 text-cream-dim" />
          <input
            type="text"
            placeholder="بحث بالاسم"
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
            className="w-full rounded-lg bg-ink border border-gold/25 ps-9 pe-3 py-2 text-sm text-cream focus:outline-none focus:border-gold"
          />
        </div>
        <select
          value={categoryId}
          onChange={(e) => {
            setPage(1);
            setCategoryId(e.target.value);
          }}
          className="rounded-lg bg-ink border border-gold/25 px-3 py-2 text-sm text-cream focus:outline-none focus:border-gold"
        >
          <option value="">كل التصنيفات</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <Link
          href="/admin/products/new"
          className="gold-gradient text-ink text-sm font-semibold px-4 py-2 rounded-lg flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> منتج جديد
        </Link>
      </div>

      <div className="rounded-xl gold-border bg-ink overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gold/15 text-cream-dim text-xs">
              <th scope="col" className="p-3 text-start">الصورة</th>
              <th scope="col" className="p-3 text-start">الاسم</th>
              <th scope="col" className="p-3 text-start">التصنيف</th>
              <th scope="col" className="p-3 text-start">السعر</th>
              <th scope="col" className="p-3 text-start">المخزون</th>
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
            ) : products.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-cream-dim">
                  لا توجد منتجات
                </td>
              </tr>
            ) : (
              products.map((product) => (
                <tr key={product.id} className="border-b border-gold/10 last:border-0 hover:bg-black/30">
                  <td className="p-3">
                    <div className="w-10 h-10 rounded-lg overflow-hidden gold-border bg-black">
                      {product.images[0] && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={product.images[0].url} alt="" className="w-full h-full object-cover" />
                      )}
                    </div>
                  </td>
                  <td className="p-3 text-cream">{product.name}</td>
                  <td className="p-3 text-cream-dim">{product.category.name}</td>
                  <td className="p-3 text-gold font-semibold">{formatPrice(product.priceDzd)}</td>
                  <td className="p-3 text-cream-dim">{product.inventoryCount}</td>
                  <td className="p-3">
                    <span className={statusPillClass(product.isPublished ? "success" : "neutral")}>
                      {product.isPublished ? "منشور" : "مسودة"}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      <Link href={`/admin/products/${product.id}`} className="text-gold text-xs hover:underline">
                        تعديل
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDelete(product.id, product.name)}
                        className="text-red-400 hover:text-red-300"
                        aria-label="حذف المنتج"
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
