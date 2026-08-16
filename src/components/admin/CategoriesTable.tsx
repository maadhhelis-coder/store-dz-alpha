"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Plus, Trash2 } from "lucide-react";
import type { Category } from "@prisma/client";

type CategoryRow = Category & { _count: { products: number } };

export default function CategoriesTable() {
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/categories");
      const data = await res.json();
      setCategories(data.categories ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchCategories();
  }, [fetchCategories]);

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`هل تريد حذف التصنيف "${name}"؟ لا يمكن التراجع عن هذا الإجراء.`)) return;
    setDeleteError(null);
    const res = await fetch(`/api/admin/categories/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setDeleteError(data?.error ?? "تعذر حذف التصنيف");
      return;
    }
    await fetchCategories();
  }

  return (
    <div>
      <div className="flex items-center justify-end mb-4">
        <Link
          href="/admin/categories/new"
          className="gold-gradient text-ink text-sm font-semibold px-4 py-2 rounded-lg flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> تصنيف جديد
        </Link>
      </div>

      {deleteError && <p className="text-xs text-red-400 mb-3">{deleteError}</p>}

      <div className="rounded-xl gold-border bg-ink overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gold/15 text-cream-dim text-xs">
              <th scope="col" className="p-3 text-start">الاسم</th>
              <th scope="col" className="p-3 text-start">الرابط</th>
              <th scope="col" className="p-3 text-start">عدد المنتجات</th>
              <th scope="col" className="p-3 text-start">الترتيب</th>
              <th scope="col" className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-cream-dim">
                  <Loader2 className="w-5 h-5 animate-spin inline" />
                </td>
              </tr>
            ) : categories.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-cream-dim">
                  لا توجد تصنيفات بعد
                </td>
              </tr>
            ) : (
              categories.map((category) => (
                <tr key={category.id} className="border-b border-gold/10 last:border-0 hover:bg-black/30">
                  <td className="p-3 text-cream">{category.name}</td>
                  <td className="p-3 text-cream-dim" dir="ltr">
                    {category.slug}
                  </td>
                  <td className="p-3 text-cream-dim">{category._count.products}</td>
                  <td className="p-3 text-cream-dim">{category.sortOrder}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      <Link href={`/admin/categories/${category.id}`} className="text-gold text-xs hover:underline">
                        تعديل
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDelete(category.id, category.name)}
                        className="text-red-400 hover:text-red-300"
                        aria-label="حذف التصنيف"
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
    </div>
  );
}
