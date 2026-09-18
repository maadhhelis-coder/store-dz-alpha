"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { RETURN_STATUS_LABELS } from "@/components/admin/crm/financeLabels";
import type { ReturnStatus } from "@prisma/client";

// إجراءات دورة الإرجاع: انتقال حالة (بسبب) + استرجاع للمخزون (كمية مُستَرجَعة
// جديدة لكل بند — الخادم يطبّق الفارق فقط ويرفض التناقص).

type Item = { id: string; name: string; quantity: number; restockedQuantity: number };

export default function ReturnActions({
  returnId,
  transitions,
  canRestock,
  items,
}: {
  returnId: string;
  transitions: ReturnStatus[];
  canRestock: boolean;
  items: Item[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [restock, setRestock] = useState<Record<string, number>>(
    Object.fromEntries(items.map((i) => [i.id, i.restockedQuantity])),
  );

  async function call(url: string, body: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "تعذّر تنفيذ الإجراء");
        return;
      }
      setReason("");
      router.refresh();
    } catch {
      setError("تعذر الاتصال بالخادم — حاول مجددًا");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="gold-border bg-ink rounded-xl p-5 space-y-4" data-testid="return-actions">
      <h2 className="font-display text-base font-bold text-cream">إجراءات</h2>
      {error && <p className="text-xs text-red-400">{error}</p>}

      {transitions.length > 0 && (
        <div className="space-y-2">
          <label className="block text-xs text-cream-dim" htmlFor="return-reason">سبب / ملاحظة (اختياري)</label>
          <input
            id="return-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            className="w-full rounded-lg bg-black border border-gold/25 px-3 py-2 text-sm text-cream focus:outline-none focus:border-gold"
          />
          <div className="flex flex-wrap gap-2">
            {transitions.map((to) => (
              <button
                key={to}
                type="button"
                disabled={busy}
                data-testid={"return-to-" + to}
                onClick={() => call("/api/admin/crm/returns/" + returnId + "/status", { status: to, reason: reason.trim() || null })}
                className="border border-gold/25 text-gold text-xs font-semibold px-3 py-2 rounded-lg hover:bg-gold/10 disabled:opacity-60"
              >
                {RETURN_STATUS_LABELS[to]}
              </button>
            ))}
          </div>
        </div>
      )}

      {canRestock && (
        <div className="space-y-2 border-t border-gold/10 pt-4">
          <p className="text-xs text-cream-dim">
            الاسترجاع للمخزون — أدخل الكمية المُسترجَعة الإجمالية لكل بند (لا تقلّ عن الحالية). يُطبَّق الفارق فقط.
          </p>
          {items.map((it) => (
            <div key={it.id} className="flex items-center justify-between gap-3 text-sm text-cream">
              <span>{it.name} <span className="text-cream-dim text-xs">(مُرجَع {it.quantity})</span></span>
              <input
                type="number"
                min={it.restockedQuantity}
                max={it.quantity}
                value={restock[it.id] ?? 0}
                data-testid={"restock-input-" + it.id}
                onChange={(e) => setRestock({ ...restock, [it.id]: Number(e.target.value) })}
                className="w-20 rounded-lg bg-black border border-gold/25 px-2 py-1 text-sm text-cream text-center"
                dir="ltr"
              />
            </div>
          ))}
          <button
            type="button"
            disabled={busy}
            data-testid="restock-submit"
            onClick={() =>
              call("/api/admin/crm/returns/" + returnId + "/restock", {
                items: items.map((it) => ({ returnItemId: it.id, restockedQuantity: restock[it.id] ?? 0 })),
                reason: reason.trim() || null,
              })
            }
            className="w-full gold-gradient text-ink text-xs font-semibold py-2 rounded-lg disabled:opacity-60 flex items-center justify-center gap-1.5"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            استرجاع للمخزون
          </button>
        </div>
      )}
    </div>
  );
}
