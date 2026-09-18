"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Undo2 } from "lucide-react";
import { RETURN_REASON_LABELS } from "@/components/admin/crm/financeLabels";
import type { ReturnReason } from "@prisma/client";

// إنشاء دورة إرجاع (جزئية أو كاملة) من صفحة الطلب — الكميات لكل بند، السبب،
// وعلم الاستبدال الصريح.

type Item = { id: string; name: string; quantity: number; returnable: number };

export default function CreateReturnButton({ orderId, items }: { orderId: string; items: Item[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState<ReturnReason>("refused");
  const [isExchange, setIsExchange] = useState(false);
  const [notes, setNotes] = useState("");
  const [qty, setQty] = useState<Record<string, number>>(Object.fromEntries(items.map((i) => [i.id, i.returnable])));

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/crm/returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          reason,
          isExchange,
          notes: notes.trim() || null,
          items: items.filter((i) => (qty[i.id] ?? 0) > 0).map((i) => ({ orderItemId: i.id, quantity: qty[i.id] })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "تعذّر إنشاء دورة الإرجاع");
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("تعذر الاتصال بالخادم — حاول مجددًا");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        data-testid="create-return-open"
        onClick={() => setOpen(true)}
        className="w-full border border-gold/25 text-gold text-xs font-semibold py-2 rounded-lg flex items-center justify-center gap-1.5 hover:bg-gold/10"
      >
        <Undo2 className="w-3.5 h-3.5" />
        دورة إرجاع جديدة
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-gold/15 p-3 text-sm" data-testid="create-return-form">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-cream-dim">
          السبب
          <select value={reason} onChange={(e) => setReason(e.target.value as ReturnReason)} className="mt-1 w-full rounded-lg bg-black border border-gold/25 px-2 py-1.5 text-cream">
            {Object.entries(RETURN_REASON_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="flex items-end gap-2 text-xs text-cream-dim pb-1.5">
          <input type="checkbox" checked={isExchange} onChange={(e) => setIsExchange(e.target.checked)} data-testid="create-return-exchange" />
          استبدال صريح (شحنة بديلة عبر «إعادة الشحن» بعد الاستلام)
        </label>
      </div>
      {items.map((it) => (
        <div key={it.id} className="flex items-center justify-between gap-3 text-cream">
          <span>{it.name} <span className="text-xs text-cream-dim">(قابل للإرجاع {it.returnable} من {it.quantity})</span></span>
          <input
            type="number"
            min={0}
            max={it.returnable}
            value={qty[it.id] ?? 0}
            data-testid={"return-qty-" + it.id}
            onChange={(e) => setQty({ ...qty, [it.id]: Number(e.target.value) })}
            className="w-20 rounded-lg bg-black border border-gold/25 px-2 py-1 text-center"
            dir="ltr"
          />
        </div>
      ))}
      <input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        maxLength={1000}
        placeholder="ملاحظات (اختياري)"
        className="w-full rounded-lg bg-black border border-gold/25 px-3 py-2 text-sm text-cream"
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={submit} disabled={busy} data-testid="create-return-submit" className="flex-1 gold-gradient text-ink text-xs font-semibold py-2 rounded-lg disabled:opacity-60 flex items-center justify-center gap-1.5">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
          إنشاء الدورة
        </button>
        <button type="button" onClick={() => setOpen(false)} disabled={busy} className="text-cream-dim text-xs hover:text-cream px-3">إلغاء</button>
      </div>
    </div>
  );
}
