"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// حل سطر فرق في تسوية — سبب إلزامي، موثّق في الخادم.
export default function ResolveSettlementItemButton({ settlementId, itemId }: { settlementId: string; itemId: string }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/crm/finance/settlements/" + settlementId + "/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "تعذّر الحل");
        return;
      }
      router.refresh();
    } catch {
      setError("تعذر الاتصال بالخادم");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="سبب الحل" data-testid={"resolve-reason-" + itemId} className="rounded-lg bg-black border border-gold/25 px-2 py-1 text-xs text-cream" />
      <button type="button" onClick={submit} disabled={busy || !reason.trim()} data-testid={"resolve-submit-" + itemId} className="border border-gold/25 text-gold text-xs font-semibold px-3 py-1 rounded-lg hover:bg-gold/10 disabled:opacity-60">حل</button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}
