"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { inputClass as baseInputClass } from "@/components/shared/FormField";
import { cn } from "@/lib/utils";

type CourierIntegrationSummary = {
  id: string;
  provider: string;
  isEnabled: boolean;
  hasApiKey: boolean;
  hasApiToken: boolean;
};

type Row = {
  id: string;
  provider: string;
  isEnabled: boolean;
  hasApiKey: boolean;
  hasApiToken: boolean;
  // undefined = لم يُعدَّل (اترك القيمة المحفوظة كما هي عند الحفظ)
  apiKey?: string;
  apiToken?: string;
};

function toRows(couriers: CourierIntegrationSummary[]): Row[] {
  return couriers.map((c) => ({
    id: c.id,
    provider: c.provider,
    isEnabled: c.isEnabled,
    hasApiKey: c.hasApiKey,
    hasApiToken: c.hasApiToken,
  }));
}

export default function CourierIntegrationsSettings() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchCouriers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/couriers");
      const data = await res.json();
      setRows(toRows(data.couriers ?? []));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // جلب البيانات عند التحميل — نمط قياسي، الإنذار غير دقيق هنا.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchCouriers();
  }, [fetchCouriers]);

  function updateRow(id: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/admin/couriers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          couriers: rows.map((r) => ({
            id: r.id,
            isEnabled: r.isEnabled,
            ...(r.apiKey !== undefined ? { apiKey: r.apiKey.trim() || null } : {}),
            ...(r.apiToken !== undefined ? { apiToken: r.apiToken.trim() || null } : {}),
          })),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: "error", text: data.error ?? "تعذر حفظ التغييرات" });
        return;
      }

      setMessage({ type: "success", text: "تم حفظ إعدادات شركات التوصيل بنجاح" });
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
      <div className="flex items-start justify-between gap-4 mb-4">
        <p className="text-xs text-cream-dim/80 leading-relaxed max-w-2xl">
          فعّل شركة التوصيل وأدخل مفاتيح API الخاصة بحسابك عندها. لن يتم إرسال أي شحنة فعليًا إلا
          بعد امتلاك حساب تاجر حقيقي مع الشركة المختارة وربطه هنا.
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
              <th scope="col" className="p-3 text-start">الشركة</th>
              <th scope="col" className="p-3 text-start">مفعّلة</th>
              <th scope="col" className="p-3 text-start">API Key</th>
              <th scope="col" className="p-3 text-start">API Token</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-gold/10 last:border-0">
                <td className="p-3 text-cream whitespace-nowrap">{row.provider}</td>
                <td className="p-2">
                  <input
                    type="checkbox"
                    checked={row.isEnabled}
                    onChange={(e) => updateRow(row.id, { isEnabled: e.target.checked })}
                  />
                </td>
                <td className="p-2">
                  <input
                    type="text"
                    dir="ltr"
                    placeholder={row.hasApiKey ? "•••••••• (محفوظ، اكتب لتغييره)" : "API Key"}
                    value={row.apiKey ?? ""}
                    onChange={(e) => updateRow(row.id, { apiKey: e.target.value })}
                    className={inputClass}
                  />
                </td>
                <td className="p-2">
                  <input
                    type="text"
                    dir="ltr"
                    placeholder={row.hasApiToken ? "•••••••• (محفوظ، اكتب لتغييره)" : "API Token"}
                    value={row.apiToken ?? ""}
                    onChange={(e) => updateRow(row.id, { apiToken: e.target.value })}
                    className={inputClass}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const inputClass = cn(baseInputClass, "w-40 py-1.5 text-left");
