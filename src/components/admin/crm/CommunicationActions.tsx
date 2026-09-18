"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MessageCircle } from "lucide-react";

// إجراءات التواصل في صفحة الطلب: إرسال يدوي (قالب أو نص حر عبر مزوّد)، وإجراءات
// على رسالة (إعادة/إلغاء/تأكيد الإرسال لروابط واتساب). كل النداءات عبر الـAPI.

const PROVIDERS = [
  { id: "whatsapp_deeplink", label: "واتساب (رابط يدوي)" },
  { id: "whatsapp_cloud", label: "واتساب Cloud API" },
  { id: "sms", label: "SMS" },
  { id: "gmail", label: "بريد (Gmail)" },
];
const TEMPLATES = [
  { id: "order_confirmed", label: "تأكيد الطلب" },
  { id: "order_shipped", label: "خرج للتوصيل" },
  { id: "order_delivered", label: "تم التسليم" },
  { id: "custom", label: "نص حر" },
];

export function SendCommunicationForm({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState("whatsapp_deeplink");
  const [template, setTemplate] = useState("order_confirmed");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/crm/communications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, provider, template, ...(template === "custom" ? { body } : {}) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "تعذّر الإرسال");
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("تعذر الاتصال بالخادم");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" data-testid="comm-open" onClick={() => setOpen(true)} className="border border-gold/25 text-gold text-xs font-semibold px-3 py-2 rounded-lg hover:bg-gold/10 flex items-center gap-1.5">
        <MessageCircle className="w-3.5 h-3.5" /> رسالة جديدة
      </button>
    );
  }
  return (
    <div className="space-y-2 rounded-lg border border-gold/15 p-3 text-sm" data-testid="comm-form">
      <div className="grid gap-2 sm:grid-cols-2">
        <select value={provider} onChange={(e) => setProvider(e.target.value)} data-testid="comm-provider" className="rounded-lg bg-black border border-gold/25 px-2 py-1.5 text-cream">
          {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <select value={template} onChange={(e) => setTemplate(e.target.value)} data-testid="comm-template" className="rounded-lg bg-black border border-gold/25 px-2 py-1.5 text-cream">
          {TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </div>
      {template === "custom" && (
        <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={1000} rows={3} placeholder="نص الرسالة" className="w-full rounded-lg bg-black border border-gold/25 px-3 py-2 text-cream" />
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={submit} disabled={busy || (template === "custom" && !body.trim())} data-testid="comm-submit" className="flex-1 gold-gradient text-ink text-xs font-semibold py-2 rounded-lg disabled:opacity-60 flex items-center justify-center gap-1.5">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} إرسال
        </button>
        <button type="button" onClick={() => setOpen(false)} disabled={busy} className="text-cream-dim text-xs hover:text-cream px-3">إلغاء</button>
      </div>
    </div>
  );
}

export function CommunicationRowActions({ id, status, url }: { id: string; status: string; url: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function act(action: "retry" | "cancel" | "mark-sent") {
    setBusy(true);
    try {
      await fetch("/api/admin/crm/communications/" + id + "/" + action, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "إجراء يدوي من صفحة الطلب" }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <span className="flex flex-wrap gap-2 text-[11px]">
      {url && status === "queued" && (
        <>
          <a href={url} target="_blank" rel="noopener noreferrer" data-testid={"comm-link-" + id} className="text-gold underline">افتح واتساب</a>
          <button type="button" disabled={busy} onClick={() => act("mark-sent")} data-testid={"comm-mark-sent-" + id} className="text-emerald-400 hover:underline">أُرسلت ✓</button>
        </>
      )}
      {status === "failed" && <button type="button" disabled={busy} onClick={() => act("retry")} data-testid={"comm-retry-" + id} className="text-gold hover:underline">إعادة</button>}
      {(status === "queued" || status === "failed") && <button type="button" disabled={busy} onClick={() => act("cancel")} data-testid={"comm-cancel-" + id} className="text-red-400 hover:underline">إلغاء</button>}
    </span>
  );
}
