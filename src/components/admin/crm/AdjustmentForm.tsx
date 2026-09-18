"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { ADJUSTMENT_DIRECTION_LABELS, ADJUSTMENT_TYPE_LABELS } from "@/components/admin/crm/financeLabels";

// تعديل مالي جديد (غير قابل للتغيير بعد الحفظ) — مبلغ صحيح دج، اتجاه، نوع، سبب إلزامي.
// correctionOfId اختياري: تصحيح تعويضي لتعديل سابق.

export default function AdjustmentForm({ orderId, correctionOfId }: { orderId?: string; correctionOfId?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState(orderId ?? "");
  const [type, setType] = useState("other");
  const [direction, setDirection] = useState<"credit" | "debit">("debit");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/crm/finance/adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: order.trim(),
          type,
          direction,
          amountDzd: Number(amount),
          reason: reason.trim(),
          correctionOfId: correctionOfId ?? null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "تعذّر حفظ التعديل");
        return;
      }
      setOpen(false);
      setAmount("");
      setReason("");
      router.refresh();
    } catch {
      setError("تعذر الاتصال بالخادم — حاول مجددًا");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" data-testid="adjustment-open" onClick={() => setOpen(true)} className="border border-gold/25 text-gold text-xs font-semibold px-3 py-2 rounded-lg hover:bg-gold/10">
        {correctionOfId ? "تصحيح تعويضي" : "تعديل مالي جديد"}
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-gold/15 p-3 text-sm" data-testid="adjustment-form">
      {!orderId && (
        <input value={order} onChange={(e) => setOrder(e.target.value)} placeholder="معرّف الطلب (UUID)" dir="ltr" className="w-full rounded-lg bg-black border border-gold/25 px-3 py-2 text-cream" />
      )}
      <div className="grid gap-2 sm:grid-cols-3">
        <select value={type} onChange={(e) => setType(e.target.value)} className="rounded-lg bg-black border border-gold/25 px-2 py-1.5 text-cream">
          {Object.entries(ADJUSTMENT_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={direction} onChange={(e) => setDirection(e.target.value as "credit" | "debit")} data-testid="adjustment-direction" className="rounded-lg bg-black border border-gold/25 px-2 py-1.5 text-cream">
          {Object.entries(ADJUSTMENT_DIRECTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input type="number" min={0} step={1} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="المبلغ دج" dir="ltr" data-testid="adjustment-amount" className="rounded-lg bg-black border border-gold/25 px-3 py-1.5 text-cream" />
      </div>
      <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="السبب (إلزامي)" data-testid="adjustment-reason" className="w-full rounded-lg bg-black border border-gold/25 px-3 py-2 text-cream" />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={submit} disabled={busy || !reason.trim() || amount === "" || !order.trim()} data-testid="adjustment-submit" className="flex-1 gold-gradient text-ink text-xs font-semibold py-2 rounded-lg disabled:opacity-60 flex items-center justify-center gap-1.5">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
          حفظ (لا يمكن تعديله لاحقًا)
        </button>
        <button type="button" onClick={() => setOpen(false)} disabled={busy} className="text-cream-dim text-xs hover:text-cream px-3">إلغاء</button>
      </div>
    </div>
  );
}
