"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Trash2, Copy, Check } from "lucide-react";
import type { Webhook, WebhookEvent } from "@prisma/client";
import { statusPillClass } from "@/components/shared/StatusPill";
import DataTablePagination from "@/components/admin/DataTablePagination";

const EVENT_LABELS: Record<WebhookEvent, string> = {
  order_created: "طلب جديد",
  order_status_changed: "تغيّر حالة الطلب",
};

const PAGE_SIZE = 20;

export default function WebhooksSettings() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<WebhookEvent[]>(["order_created"]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchWebhooks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/webhooks?page=${page}&pageSize=${PAGE_SIZE}`);
      const data = await res.json();
      setWebhooks(data.items ?? []);
      setTotal(data.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    // جلب البيانات عند التحميل — نمط قياسي، الإنذار غير دقيق هنا.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchWebhooks();
  }, [fetchWebhooks]);

  function toggleEvent(event: WebhookEvent) {
    setEvents((prev) => (prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]));
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (events.length === 0) {
      setError("اختر حدثًا واحدًا على الأقل");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, events }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "تعذر إضافة الـ Webhook");
        return;
      }

      setNewSecret(data.secret);
      setUrl("");
      setEvents(["order_created"]);
      await fetchWebhooks();
    } catch {
      setError("تعذر الاتصال بالخادم");
    } finally {
      setSaving(false);
    }
  }

  async function handleCopySecret() {
    if (!newSecret) return;
    await navigator.clipboard.writeText(newSecret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleDelete(id: string, url: string) {
    if (!window.confirm(`هل تريد حذف الـ Webhook "${url}"؟ لا يمكن التراجع عن هذا الإجراء.`)) return;
    await fetch(`/api/admin/webhooks/${id}`, { method: "DELETE" });
    await fetchWebhooks();
  }

  return (
    <div>
      {newSecret && (
        <div className="rounded-xl border border-gold bg-ink p-5 mb-6">
          <p className="text-sm text-cream mb-2">
            انسخ سر التوقيع (Signing Secret) الآن — لن يُعرض مرة أخرى. استعمله فطرف الاستقبال
            للتحقق من ترويسة <code dir="ltr">X-Webhook-Signature</code>:
          </p>
          <div className="flex items-center gap-2">
            <code dir="ltr" className="flex-1 text-xs text-gold bg-black rounded-lg px-3 py-2.5 overflow-x-auto">
              {newSecret}
            </code>
            <button
              type="button"
              onClick={handleCopySecret}
              className="gold-gradient text-ink text-sm font-semibold px-3 py-2.5 rounded-lg flex items-center gap-1.5 shrink-0"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}

      <form onSubmit={handleAdd} className="rounded-xl gold-border bg-ink p-5 space-y-4 mb-6">
        <h2 className="font-display font-semibold text-gold">إضافة Webhook جديد</h2>
        <label className="block">
          <span className="text-xs text-cream-dim mb-1.5 block">رابط الـ Webhook (URL)</span>
          <input
            type="text"
            dir="ltr"
            required
            placeholder="https://example.com/webhook"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="w-full rounded-lg bg-black border border-gold/25 px-3 py-2.5 text-sm text-cream focus:outline-none focus:border-gold text-left"
          />
        </label>
        <div>
          <span className="text-xs text-cream-dim mb-1.5 block">الأحداث</span>
          <div className="flex gap-4">
            {(Object.keys(EVENT_LABELS) as WebhookEvent[]).map((ev) => (
              <label key={ev} className="flex items-center gap-1.5 text-sm text-cream-dim">
                <input type="checkbox" checked={events.includes(ev)} onChange={() => toggleEvent(ev)} />
                {EVENT_LABELS[ev]}
              </label>
            ))}
          </div>
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="gold-gradient text-ink text-sm font-semibold px-4 py-2 rounded-lg flex items-center gap-1.5 disabled:opacity-60"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          إضافة Web Hook
        </button>
      </form>

      <div className="rounded-xl gold-border bg-ink overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gold/15 text-cream-dim text-xs">
              <th scope="col" className="p-3 text-start">الرابط</th>
              <th scope="col" className="p-3 text-start">الأحداث</th>
              <th scope="col" className="p-3 text-start">آخر إطلاق</th>
              <th scope="col" className="p-3 text-start">آخر حالة</th>
              <th scope="col" className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-cream-dim">
                  <Loader2 className="w-5 h-5 animate-spin inline" />
                </td>
              </tr>
            ) : webhooks.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-cream-dim">
                  لا توجد Webhooks بعد
                </td>
              </tr>
            ) : (
              webhooks.map((w) => (
                <tr key={w.id} className="border-b border-gold/10 last:border-0">
                  <td className="p-3 text-cream text-xs" dir="ltr">
                    <a href={w.url} target="_blank" rel="noopener noreferrer" className="hover:text-gold hover:underline">
                      {w.url}
                    </a>
                  </td>
                  <td className="p-3 text-cream-dim text-xs">
                    {w.events.map((e) => EVENT_LABELS[e]).join("، ")}
                  </td>
                  <td className="p-3 text-cream-dim text-xs">
                    {w.lastFiredAt ? new Date(w.lastFiredAt).toLocaleString("ar-DZ-u-nu-latn") : "—"}
                  </td>
                  <td className="p-3">
                    {w.lastStatus === null ? (
                      <span className="text-cream-dim text-xs">—</span>
                    ) : (
                      <span className={statusPillClass(w.lastStatus >= 200 && w.lastStatus < 300 ? "success" : "danger")}>
                        {w.lastStatus}
                      </span>
                    )}
                  </td>
                  <td className="p-3">
                    <button
                      type="button"
                      onClick={() => handleDelete(w.id, w.url)}
                      className="text-red-400 hover:text-red-300"
                      aria-label="حذف"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <DataTablePagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
    </div>
  );
}
