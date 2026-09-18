"use client";

import { useState } from "react";

// تصدير CSV — الخادم يفرض الصلاحيات والحد. 413 = تجاوز الحد، 403 = صلاحية ناقصة:
// تُعرض كما هي بلا ادّعاء نجاح.

const ENTITIES: { id: string; label: string }[] = [
  { id: "orders", label: "الطلبات" },
  { id: "customers", label: "العملاء" },
  { id: "returns", label: "المرتجعات" },
  { id: "settlements", label: "تسويات COD" },
  { id: "audit", label: "سجل التدقيق" },
];

export default function ExportsPanel({ maxRows }: { maxRows: number }) {
  const [entity, setEntity] = useState("orders");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMessage(null);
    const q = new URLSearchParams({ entity });
    if (dateFrom) q.set("dateFrom", new Date(dateFrom).toISOString());
    if (dateTo) q.set("dateTo", new Date(dateTo + "T23:59:59.999Z").toISOString());
    if (status.trim()) q.set("status", status.trim());
    try {
      const res = await fetch("/api/admin/crm/exports?" + q.toString());
      if (!res.ok) {
        setMessage((await res.json().catch(() => ({}))).error ?? "فشل التصدير (" + res.status + ")");
        return;
      }
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? entity + ".csv";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
      setMessage("تم تنزيل " + (res.headers.get("X-Export-Rows") ?? "?") + " صفًا");
    } catch {
      setMessage("تعذر الاتصال بالخادم");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="gold-border bg-ink rounded-xl p-4 space-y-3" data-testid="exports-panel">
      <p className="text-xs text-cream-dim">CSV (UTF-8، تواريخ UTC، مبالغ دج صحيحة). الحد {maxRows} صفًا لكل ملف — يُرفض التجاوز صراحةً بدل اقتطاع صامت (غيّر الحد من إعدادات CRM).</p>
      <div className="flex flex-wrap items-end gap-3 text-xs text-cream-dim">
        <label>الكيان
          <select value={entity} onChange={(e) => setEntity(e.target.value)} data-testid="export-entity" className="block mt-1 rounded-lg border border-gold/25 bg-ink px-2 py-1 text-sm text-cream">
            {ENTITIES.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
          </select>
        </label>
        <label>من
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="block mt-1 rounded-lg border border-gold/25 bg-ink px-2 py-1 text-sm text-cream" />
        </label>
        <label>إلى
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="block mt-1 rounded-lg border border-gold/25 bg-ink px-2 py-1 text-sm text-cream" />
        </label>
        <label>الحالة/الإجراء
          <input value={status} onChange={(e) => setStatus(e.target.value)} dir="ltr" placeholder="delivered" className="block mt-1 rounded-lg border border-gold/25 bg-ink px-2 py-1 text-sm text-cream" />
        </label>
        <button type="button" disabled={busy} onClick={run} data-testid="export-run" className="gold-gradient text-ink text-xs font-semibold px-3 py-2 rounded-lg disabled:opacity-60">تصدير</button>
      </div>
      {message && <p className="text-xs text-cream" data-testid="export-message">{message}</p>}
    </div>
  );
}
