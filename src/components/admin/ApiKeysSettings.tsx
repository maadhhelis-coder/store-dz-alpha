"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Trash2, Copy, Check } from "lucide-react";
import type { ApiKey } from "@prisma/client";
import { API_KEY_SCOPES, API_KEY_SCOPE_LABELS, type ApiKeyScope } from "@/lib/apiKeyScopes";
import { statusPillClass } from "@/components/shared/StatusPill";

export default function ApiKeysSettings() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState("");
  const [scopes, setScopes] = useState<ApiKeyScope[]>([]);
  const [expiresAt, setExpiresAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newRawKey, setNewRawKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function toggleScope(scope: ApiKeyScope) {
    setScopes((prev) => (prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]));
  }

  const fetchApiKeys = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/api-keys");
      const data = await res.json();
      setApiKeys(data.apiKeys ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchApiKeys();
  }, [fetchApiKeys]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/admin/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label,
          scopes,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "تعذر إنشاء المفتاح");
        return;
      }

      setNewRawKey(data.rawKey);
      setLabel("");
      setScopes([]);
      setExpiresAt("");
      await fetchApiKeys();
    } catch {
      setError("تعذر الاتصال بالخادم");
    } finally {
      setSaving(false);
    }
  }

  async function handleRevoke(id: string, label: string) {
    if (!window.confirm(`هل تريد إلغاء مفتاح API "${label}"؟ أي نظام يستعمله سيتوقف عن العمل فورًا، ولا يمكن التراجع عن هذا الإجراء.`)) return;
    setApiKeys((prev) => prev.filter((k) => k.id !== id));
    await fetch(`/api/admin/api-keys/${id}`, { method: "DELETE" });
  }

  async function handleCopy() {
    if (!newRawKey) return;
    await navigator.clipboard.writeText(newRawKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div>
      <h2 className="font-display font-semibold text-gold mb-4">مفاتيح API (للوكيل الذكي والأنظمة الخارجية)</h2>

      {newRawKey && (
        <div className="rounded-xl border border-gold bg-ink p-5 mb-6">
          <p className="text-sm text-cream mb-2">
            انسخ هذا المفتاح الآن — لن يُعرض مرة أخرى:
          </p>
          <div className="flex items-center gap-2">
            <code dir="ltr" className="flex-1 text-xs text-gold bg-black rounded-lg px-3 py-2.5 overflow-x-auto">
              {newRawKey}
            </code>
            <button
              type="button"
              onClick={handleCopy}
              className="gold-gradient text-ink text-sm font-semibold px-3 py-2.5 rounded-lg flex items-center gap-1.5 shrink-0"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}

      <form onSubmit={handleAdd} className="rounded-xl gold-border bg-ink p-5 space-y-4 mb-6">
        <label className="block">
          <span className="text-xs text-cream-dim mb-1.5 block">اسم المفتاح (مثال: وكيل واتساب)</span>
          <input
            type="text"
            required
            placeholder="وكيل واتساب"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full rounded-lg bg-black border border-gold/25 px-3 py-2.5 text-sm text-cream focus:outline-none focus:border-gold"
          />
        </label>

        <div>
          <span className="text-xs text-cream-dim mb-1.5 block">
            الصلاحيات (اترك الكل غير محدَّد لوصول كامل)
          </span>
          <div className="flex flex-wrap gap-3">
            {API_KEY_SCOPES.map((scope) => (
              <label key={scope} className="flex items-center gap-1.5 text-xs text-cream-dim">
                <input
                  type="checkbox"
                  checked={scopes.includes(scope)}
                  onChange={() => toggleScope(scope)}
                />
                {API_KEY_SCOPE_LABELS[scope]}
              </label>
            ))}
          </div>
        </div>

        <label className="block max-w-xs">
          <span className="text-xs text-cream-dim mb-1.5 block">تاريخ انتهاء الصلاحية (اختياري)</span>
          <input
            type="date"
            value={expiresAt}
            min={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="w-full rounded-lg bg-black border border-gold/25 px-3 py-2.5 text-sm text-cream focus:outline-none focus:border-gold"
          />
          <span className="text-[11px] text-cream-dim/80 mt-1 block">اتركه فارغًا لمفتاح بلا انتهاء صلاحية.</span>
        </label>

        {error && <p className="text-xs text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="gold-gradient text-ink text-sm font-semibold px-4 py-2 rounded-lg flex items-center gap-1.5 disabled:opacity-60"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          إنشاء مفتاح جديد
        </button>
      </form>

      <div className="rounded-xl gold-border bg-ink overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gold/15 text-cream-dim text-xs">
              <th scope="col" className="p-3 text-start">الاسم</th>
              <th scope="col" className="p-3 text-start">الصلاحيات</th>
              <th scope="col" className="p-3 text-start">آخر استخدام</th>
              <th scope="col" className="p-3 text-start">انتهاء الصلاحية</th>
              <th scope="col" className="p-3 text-start">الحالة</th>
              <th scope="col" className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-cream-dim">
                  <Loader2 className="w-5 h-5 animate-spin inline" />
                </td>
              </tr>
            ) : apiKeys.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-cream-dim">
                  لا توجد مفاتيح بعد
                </td>
              </tr>
            ) : (
              apiKeys.map((k) => {
                // مقارنة بالوقت الحالي لعرض شارة "منتهي" — مقصودة أن تعكس اللحظة الفعلية،
                // وليست حالة يُعاد استعمالها فحسابات أخرى تتأثر بالتوقيت الثابت.
                // eslint-disable-next-line react-hooks/purity
                const isExpired = !!k.expiresAt && new Date(k.expiresAt).getTime() < Date.now();
                return (
                  <tr key={k.id} className="border-b border-gold/10 last:border-0">
                    <td className="p-3 text-cream text-xs">{k.label}</td>
                    <td className="p-3 text-cream-dim text-xs">
                      {k.scopes.length === 0
                        ? "وصول كامل"
                        : k.scopes.map((s) => API_KEY_SCOPE_LABELS[s as ApiKeyScope] ?? s).join("، ")}
                    </td>
                    <td className="p-3 text-cream-dim text-xs">
                      {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString("ar-DZ-u-nu-latn") : "—"}
                    </td>
                    <td className="p-3 text-cream-dim text-xs">
                      {k.expiresAt ? new Date(k.expiresAt).toLocaleDateString("ar-DZ-u-nu-latn") : "بلا انتهاء"}
                    </td>
                    <td className="p-3">
                      {k.revokedAt ? (
                        <span className={statusPillClass("danger")}>مُلغى</span>
                      ) : isExpired ? (
                        <span className={statusPillClass("warning")}>منتهي</span>
                      ) : (
                        <span className={statusPillClass("success")}>نشط</span>
                      )}
                    </td>
                    <td className="p-3">
                      {!k.revokedAt && (
                        <button
                          type="button"
                          onClick={() => handleRevoke(k.id, k.label)}
                          className="text-red-400 hover:text-red-300"
                          aria-label="إلغاء"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
