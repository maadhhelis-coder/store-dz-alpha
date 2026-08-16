"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Mail, Loader2, ChevronDown, Unplug } from "lucide-react";
import { cn } from "@/lib/utils";
import { inputClassLtr as inputClass } from "@/components/shared/FormField";
import { statusPillClass } from "@/components/shared/StatusPill";

type Integration = {
  provider: string;
  isConnected: boolean;
  connectedEmail: string | null;
  clientId: string | null;
  hasClientSecret: boolean;
};

const PROVIDERS: { id: string; label: string; supported: boolean }[] = [
  { id: "gmail", label: "Gmail", supported: true },
  { id: "outlook", label: "Outlook", supported: false },
  { id: "yahoo", label: "Yahoo", supported: false },
];

export default function MessagingIntegrationSettings() {
  const searchParams = useSearchParams();
  const [integrations, setIntegrations] = useState<Record<string, Integration>>({});
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchIntegrations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/email-integrations");
      const data = await res.json();
      const map: Record<string, Integration> = {};
      for (const it of data.integrations ?? []) map[it.provider] = it;
      setIntegrations(map);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // جلب البيانات عند التحميل — نمط قياسي، الإنذار غير دقيق هنا.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchIntegrations();
  }, [fetchIntegrations]);

  useEffect(() => {
    const connected = searchParams.get("email_connected");
    const error = searchParams.get("email_error");
    // رسالة نجاح/فشل تُقرأ من رابط إعادة التوجيه بعد OAuth — لا يمكن معرفتها إلا بعد
    // التركيب فالمتصفح، نفس نمط جلب البيانات أعلاه.
    if (connected) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMessage({ type: "success", text: `تم ربط ${connected === "gmail" ? "Gmail" : connected} بنجاح` });
    } else if (error) {
      setMessage({ type: "error", text: "تعذر إتمام الربط — تحقق من Client ID و Client Secret" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="max-w-xl space-y-3">
      <p className="text-xs text-cream-dim/80 leading-relaxed">
        اربط بريدك الإلكتروني لاستقبال رسائل الزبائن. اضغط على أي مزوّد أدناه للربط أو قطع الاتصال.
      </p>

      {message && (
        <p className={`text-xs ${message.type === "success" ? "text-green-400" : "text-red-400"}`}>
          {message.text}
        </p>
      )}

      {loading ? (
        <div className="p-8 text-center text-cream-dim">
          <Loader2 className="w-5 h-5 animate-spin inline" />
        </div>
      ) : (
        <div className="space-y-3">
          {PROVIDERS.map((p) => {
            const integration = integrations[p.id];
            const isOpen = expanded === p.id;
            return (
              <div key={p.id} className="rounded-lg border border-gold/15 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : p.id)}
                  aria-expanded={isOpen}
                  aria-controls={`messaging-integration-panel-${p.id}`}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-black/20 transition-colors"
                >
                  <span className="flex items-center gap-2.5 text-sm text-cream">
                    <Mail className="w-4 h-4 text-gold" />
                    {p.label}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className={statusPillClass(integration?.isConnected ? "success" : "neutral")}>
                      {integration?.isConnected ? `مربوط ✓ ${integration.connectedEmail ?? ""}` : "غير مربوط"}
                    </span>
                    <ChevronDown className={cn("w-4 h-4 text-cream-dim transition-transform", isOpen && "rotate-180")} />
                  </span>
                </button>

                {isOpen && (
                  <div id={`messaging-integration-panel-${p.id}`} className="px-4 py-4 border-t border-gold/10 bg-black/20">
                    {!p.supported ? (
                      <p className="text-xs text-cream-dim">هذا المزوّد قريبًا — Gmail متاح للربط الآن.</p>
                    ) : integration?.isConnected ? (
                      <ConnectedPanel provider={p.id} email={integration.connectedEmail} onDisconnected={fetchIntegrations} />
                    ) : (
                      <ConnectPanel
                        provider={p.id}
                        initialClientId={integration?.clientId ?? ""}
                        hasClientSecret={integration?.hasClientSecret ?? false}
                        onSaved={fetchIntegrations}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ConnectedPanel({
  provider,
  email,
  onDisconnected,
}: {
  provider: string;
  email: string | null;
  onDisconnected: () => void;
}) {
  const [disconnecting, setDisconnecting] = useState(false);

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      await fetch(`/api/admin/email-integrations/${provider}`, { method: "DELETE" });
      await onDisconnected();
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-xs text-cream-dim">متصل بالحساب: <span dir="ltr" className="text-cream">{email}</span></p>
      <button
        type="button"
        onClick={handleDisconnect}
        disabled={disconnecting}
        className="flex items-center gap-1.5 text-xs font-semibold text-red-400 hover:text-red-300 disabled:opacity-60"
      >
        {disconnecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unplug className="w-3.5 h-3.5" />}
        قطع الاتصال
      </button>
    </div>
  );
}

function ConnectPanel({
  provider,
  initialClientId,
  hasClientSecret,
  onSaved,
}: {
  provider: string;
  initialClientId: string;
  hasClientSecret: boolean;
  onSaved: () => void;
}) {
  const [clientId, setClientId] = useState(initialClientId);
  const [clientSecret, setClientSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConnect() {
    setError(null);
    if (!clientId.trim() || (!clientSecret.trim() && !hasClientSecret)) {
      setError("أدخل Client ID و Client Secret");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/admin/email-integrations/${provider}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: clientId.trim(),
          ...(clientSecret.trim() ? { clientSecret: clientSecret.trim() } : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "تعذر حفظ البيانات");
        return;
      }
      await onSaved();
      window.location.href = `/api/admin/email-integrations/${provider}/connect`;
    } catch {
      setError("تعذر الاتصال بالخادم");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-cream-dim/80 leading-relaxed">
        أنشئ تطبيق OAuth في{" "}
        <a
          href="https://console.cloud.google.com/apis/credentials"
          target="_blank"
          rel="noreferrer"
          className="text-gold underline"
        >
          Google Cloud Console
        </a>{" "}
        واحصل على Client ID و Client Secret، ثم الصقهما هنا واضغط ربط.
      </p>
      <label className="block">
        <span className="text-xs text-cream-dim mb-1.5 block">Client ID</span>
        <input
          type="text"
          dir="ltr"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className={inputClass}
        />
      </label>
      <label className="block">
        <span className="text-xs text-cream-dim mb-1.5 block">Client Secret</span>
        <input
          type="password"
          dir="ltr"
          placeholder={hasClientSecret ? "•••••••• (محفوظ، اكتب لتغييره)" : ""}
          value={clientSecret}
          onChange={(e) => setClientSecret(e.target.value)}
          className={inputClass}
        />
      </label>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button
        type="button"
        onClick={handleConnect}
        disabled={saving}
        className="gold-gradient text-ink text-sm font-semibold px-4 py-2 rounded-lg flex items-center gap-1.5 disabled:opacity-60"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        ربط الحساب
      </button>
    </div>
  );
}
