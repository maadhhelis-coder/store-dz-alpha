"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw } from "lucide-react";

// إعادة الشحن — سبب إلزامي بحكم العقد (المسار يرفض بلا سبب بـ400).
// لا تُنشئ شحنة: تُعيد الطلب المرتجع إلى الدورة فتُنشأ الشحنة التالية بالمسار
// العادي وتخضع لقاعدة الشحنة النشطة الواحدة كما هي.

export default function ReshipButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/reship`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "تعذّرت إعادة الشحن");
        return;
      }
      setOpen(false);
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
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full border border-gold/25 text-gold text-xs font-semibold py-2 rounded-lg flex items-center justify-center gap-1.5 hover:bg-gold/10"
      >
        <RotateCcw className="w-3.5 h-3.5" />
        إعادة الشحن
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-gold/15 p-3">
      <label className="block text-xs text-cream-dim" htmlFor="reship-reason">
        سبب إعادة الشحن (إلزامي)
      </label>
      <input
        id="reship-reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={500}
        placeholder="مثال: الزبون طلب إعادة المحاولة بعنوان مصحّح"
        className="w-full rounded-lg bg-black border border-gold/25 px-3 py-2 text-sm text-cream focus:outline-none focus:border-gold"
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={busy || reason.trim().length === 0}
          className="flex-1 gold-gradient text-ink text-xs font-semibold py-2 rounded-lg disabled:opacity-60 flex items-center justify-center gap-1.5"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
          تأكيد
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={busy}
          className="text-cream-dim text-xs hover:text-cream px-3"
        >
          إلغاء
        </button>
      </div>
    </div>
  );
}
