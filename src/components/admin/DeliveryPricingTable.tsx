"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2, Save } from "lucide-react";
import type { Wilaya } from "@prisma/client";
import { inputClass as baseInputClass } from "@/components/shared/FormField";
import { cn } from "@/lib/utils";

type Row = {
  code: number;
  name: string;
  officePriceDzd: string;
  homePriceDzd: string;
  isActive: boolean;
};

function toRows(wilayas: Wilaya[]): Row[] {
  return wilayas.map((w) => ({
    code: w.code,
    name: w.name,
    officePriceDzd: w.officePriceDzd !== null ? String(w.officePriceDzd) : "",
    homePriceDzd: String(w.homePriceDzd),
    isActive: w.isActive,
  }));
}

export default function DeliveryPricingTable() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchWilayas = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/wilayas");
      const data = await res.json();
      setRows(toRows(data.wilayas ?? []));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // جلب البيانات عند التحميل — نمط قياسي، الإنذار غير دقيق هنا.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchWilayas();
  }, [fetchWilayas]);

  function updateRow(code: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.code === code ? { ...r, ...patch } : r)));
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);

    const payload = {
      wilayas: rows.map((r) => ({
        code: r.code,
        officePriceDzd: r.officePriceDzd.trim() === "" ? null : Number(r.officePriceDzd),
        homePriceDzd: Number(r.homePriceDzd),
        isActive: r.isActive,
      })),
    };

    try {
      const res = await fetch("/api/admin/wilayas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: "error", text: data.error ?? "تعذر حفظ التغييرات" });
        return;
      }

      setMessage({ type: "success", text: "تم حفظ أسعار التوصيل بنجاح" });
    } catch {
      setMessage({ type: "error", text: "تعذر الاتصال بالخادم" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="p-8 text-center text-cream-dim">
        <Loader2 className="w-5 h-5 animate-spin inline" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-cream-dim">
          عدّل أسعار التوصيل لكل ولاية. اترك سعر المكتب فارغًا إذا كان التوصيل للمكتب غير متوفر.
        </p>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="gold-gradient text-ink text-sm font-semibold px-4 py-2 rounded-lg flex items-center gap-1.5 shrink-0 disabled:opacity-60"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          حفظ التغييرات
        </button>
      </div>

      {message && (
        <p className={`text-xs mb-3 ${message.type === "success" ? "text-green-400" : "text-red-400"}`}>
          {message.text}
        </p>
      )}

      <div className="rounded-xl gold-border bg-ink overflow-x-auto max-h-[560px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-ink z-10">
            <tr className="border-b border-gold/15 text-cream-dim text-xs">
              <th scope="col" className="p-3 text-start">الولاية</th>
              <th scope="col" className="p-3 text-start">سعر التوصيل للمكتب (دج)</th>
              <th scope="col" className="p-3 text-start">سعر التوصيل للمنزل (دج)</th>
              <th scope="col" className="p-3 text-start">مفعّلة</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const officePrice = row.officePriceDzd.trim() === "" ? null : Number(row.officePriceDzd);
              const homePrice = Number(row.homePriceDzd);
              const officeExceedsHome =
                officePrice !== null && !Number.isNaN(officePrice) && !Number.isNaN(homePrice) && officePrice > homePrice;

              return (
                <tr key={row.code} className="border-b border-gold/10 last:border-0">
                  <td className="p-3 text-cream">
                    {row.code} - {row.name}
                  </td>
                  <td className="p-2">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={0}
                        placeholder="غير متوفر"
                        value={row.officePriceDzd}
                        onChange={(e) => updateRow(row.code, { officePriceDzd: e.target.value })}
                        className={inputClass}
                      />
                      {officeExceedsHome && (
                        <span title="سعر توصيل المكتب أعلى من سعر توصيل المنزل — تأكد أن هذا مقصود">
                          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-2">
                    <input
                      type="number"
                      min={0}
                      required
                      value={row.homePriceDzd}
                      onChange={(e) => updateRow(row.code, { homePriceDzd: e.target.value })}
                      className={inputClass}
                    />
                  </td>
                  <td className="p-2">
                    <input
                      type="checkbox"
                      checked={row.isActive}
                      onChange={(e) => updateRow(row.code, { isActive: e.target.checked })}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const inputClass = cn(baseInputClass, "w-32 py-1.5");
