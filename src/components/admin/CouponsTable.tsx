"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import type { Coupon } from "@prisma/client";
import { inputClassLtr as inputClass } from "@/components/shared/FormField";
import { statusPillClass } from "@/components/shared/StatusPill";
import DataTablePagination from "@/components/admin/DataTablePagination";

const PAGE_SIZE = 20;

export default function CouponsTable() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [type, setType] = useState<"percentage" | "fixed">("percentage");
  const [value, setValue] = useState("10");
  const [usageLimit, setUsageLimit] = useState("");
  const [minOrderDzd, setMinOrderDzd] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  const fetchCoupons = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/coupons?page=${page}&pageSize=${PAGE_SIZE}`);
      const data = await res.json();
      setCoupons(data.items ?? []);
      setTotal(data.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    // جلب البيانات عند التحميل — نمط قياسي، الإنذار غير دقيق هنا.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchCoupons();
  }, [fetchCoupons]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const res = await fetch("/api/admin/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          type,
          value: Number(value),
          usageLimit: usageLimit ? Number(usageLimit) : undefined,
          minOrderDzd: minOrderDzd ? Number(minOrderDzd) : undefined,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "تعذر إضافة الكوبون");
        return;
      }

      setCode("");
      setValue("10");
      setUsageLimit("");
      setMinOrderDzd("");
      setExpiresAt("");
      await fetchCoupons();
    } catch {
      setError("تعذر الاتصال بالخادم");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(coupon: Coupon) {
    setCoupons((prev) => prev.map((c) => (c.id === coupon.id ? { ...c, isActive: !c.isActive } : c)));
    await fetch(`/api/admin/coupons/${coupon.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !coupon.isActive }),
    });
  }

  async function handleDelete(id: string, code: string) {
    if (!window.confirm(`هل تريد حذف الكوبون "${code}"؟ لا يمكن التراجع عن هذا الإجراء.`)) return;
    await fetch(`/api/admin/coupons/${id}`, { method: "DELETE" });
    // إعادة جلب فعلية بدل حذف محلي فقط — يُبقي total ورقم الصفحة متطابقين مع السيرفر
    // بعد الحذف (نفس نمط ProductsTable.tsx تحديدًا لهذا السبب).
    await fetchCoupons();
  }

  return (
    <div>
      <form onSubmit={handleAdd} className="rounded-xl gold-border bg-ink p-5 space-y-4 mb-6">
        <h2 className="font-display font-semibold text-gold">إضافة كوبون خصم جديد</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-xs text-cream-dim mb-1.5 block">الكود</span>
            <input
              type="text"
              dir="ltr"
              required
              placeholder="مثال: WELCOME10"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="text-xs text-cream-dim mb-1.5 block">نوع الخصم</span>
            <select value={type} onChange={(e) => setType(e.target.value as "percentage" | "fixed")} className={inputClass}>
              <option value="percentage">نسبة مئوية (%)</option>
              <option value="fixed">مبلغ ثابت (دج)</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-cream-dim mb-1.5 block">
              القيمة {type === "percentage" ? "(%)" : "(دج)"}
            </span>
            <input
              type="number"
              min={1}
              required
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="text-xs text-cream-dim mb-1.5 block">حد أدنى للطلب (دج) — اختياري</span>
            <input
              type="number"
              min={0}
              placeholder="بلا حد أدنى"
              value={minOrderDzd}
              onChange={(e) => setMinOrderDzd(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="text-xs text-cream-dim mb-1.5 block">عدد مرات الاستخدام — اختياري</span>
            <input
              type="number"
              min={1}
              placeholder="بلا حد"
              value={usageLimit}
              onChange={(e) => setUsageLimit(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="text-xs text-cream-dim mb-1.5 block">تاريخ الانتهاء — اختياري</span>
            <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className={inputClass} />
          </label>
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="gold-gradient text-ink text-sm font-semibold px-4 py-2 rounded-lg flex items-center gap-1.5 disabled:opacity-60"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          إضافة كوبون
        </button>
      </form>

      <div className="rounded-xl gold-border bg-ink overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gold/15 text-cream-dim text-xs">
              <th scope="col" className="p-3 text-start">الكود</th>
              <th scope="col" className="p-3 text-start">الخصم</th>
              <th scope="col" className="p-3 text-start">الاستخدام</th>
              <th scope="col" className="p-3 text-start">الحد الأدنى</th>
              <th scope="col" className="p-3 text-start">الانتهاء</th>
              <th scope="col" className="p-3 text-start">مفعّل</th>
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
            ) : coupons.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-cream-dim">
                  لا توجد كوبونات بعد
                </td>
              </tr>
            ) : (
              coupons.map((c) => (
                <tr key={c.id} className="border-b border-gold/10 last:border-0">
                  <td className="p-3 text-cream font-semibold" dir="ltr">{c.code}</td>
                  <td className="p-3 text-cream-dim text-xs">
                    {c.type === "percentage" ? `${c.value}%` : `${c.value} دج`}
                  </td>
                  <td className="p-3 text-cream-dim text-xs">
                    {c.usedCount} {c.usageLimit ? `/ ${c.usageLimit}` : "(بلا حد)"}
                  </td>
                  <td className="p-3 text-cream-dim text-xs">{c.minOrderDzd ? `${c.minOrderDzd} دج` : "—"}</td>
                  <td className="p-3 text-cream-dim text-xs">
                    {c.expiresAt ? new Date(c.expiresAt).toLocaleDateString("ar-DZ-u-nu-latn") : "—"}
                  </td>
                  <td className="p-2">
                    <button
                      type="button"
                      onClick={() => handleToggleActive(c)}
                      className={statusPillClass(c.isActive ? "success" : "neutral")}
                    >
                      {c.isActive ? "نشط" : "معطّل"}
                    </button>
                  </td>
                  <td className="p-3">
                    <button
                      type="button"
                      onClick={() => handleDelete(c.id, c.code)}
                      className="text-red-400 hover:text-red-300"
                      aria-label="حذف"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
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
