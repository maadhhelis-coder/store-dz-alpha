"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

// استيراد كشف تسوية COD — سطر لكل شحنة: "رقم التتبّع أو رقم الطلب, المبلغ المحصَّل".
// الاستيراد idempotent: نفس الكشف مرة ثانية = 200 replayed بلا أثر؛ نفس المرجع بمحتوى
// مختلف = 409 تعارض يُعرض ولا يُدهس شيء.

export default function SettlementImportForm() {
  const router = useRouter();
  const [provider, setProvider] = useState("dhd");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    setResult(null);
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [idRaw, amountRaw] = l.split(/[,;\t]/).map((p) => p.trim());
        const isOrder = /^SD-/i.test(idRaw ?? "");
        return { [isOrder ? "orderNumber" : "trackingNumber"]: idRaw, collectedDzd: Number(amountRaw) };
      });
    try {
      const res = await fetch("/api/admin/crm/finance/settlements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, settlementDate: date, reference: reference.trim() || null, lines }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "تعذّر الاستيراد");
        return;
      }
      setResult(
        (data.replayed ? "كشف مستورد سابقًا (بلا أثر جديد)" : "تم الاستيراد") +
          " — مطابق: " + data.matched + " · فروق: " + data.discrepancies + " · بلا طلب: " + data.unmatched.length,
      );
      setText("");
      router.refresh();
    } catch {
      setError("تعذر الاتصال بالخادم");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="gold-border bg-ink rounded-xl p-5 space-y-3 text-sm" data-testid="settlement-import-form">
      <h2 className="font-display text-base font-bold text-cream">استيراد كشف تسوية</h2>
      <div className="grid gap-2 sm:grid-cols-3">
        <input value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="الناقل (dhd)" dir="ltr" className="rounded-lg bg-black border border-gold/25 px-3 py-2 text-cream" />
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} dir="ltr" className="rounded-lg bg-black border border-gold/25 px-3 py-2 text-cream" />
        <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="مرجع الدفعة (يُفضَّل)" dir="ltr" className="rounded-lg bg-black border border-gold/25 px-3 py-2 text-cream" />
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        dir="ltr"
        placeholder={"TRK123456, 4500\nSD-000731, 3200"}
        data-testid="settlement-lines"
        className="w-full rounded-lg bg-black border border-gold/25 px-3 py-2 font-mono text-xs text-cream"
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      {result && <p className="text-xs text-emerald-400" data-testid="settlement-result">{result}</p>}
      <button type="button" onClick={submit} disabled={busy || !text.trim()} data-testid="settlement-submit" className="gold-gradient text-ink text-xs font-semibold px-4 py-2 rounded-lg disabled:opacity-60 flex items-center gap-1.5">
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
        استيراد
      </button>
    </div>
  );
}
