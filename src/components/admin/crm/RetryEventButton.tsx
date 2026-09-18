"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RetryEventButton({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function retry() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/crm/automation/" + eventId + "/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "إعادة يدوية من لوحة الأتمتة" }),
      });
      if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "تعذّرت الإعادة");
      else router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <span className="flex items-center gap-2">
      <button type="button" onClick={retry} disabled={busy} data-testid={"retry-" + eventId} className="border border-gold/25 text-gold text-xs font-semibold px-3 py-1 rounded-lg hover:bg-gold/10 disabled:opacity-60">إعادة</button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </span>
  );
}
