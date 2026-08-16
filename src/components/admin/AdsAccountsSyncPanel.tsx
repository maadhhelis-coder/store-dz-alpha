"use client";

import { useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { inputClassLtr as inputClass } from "@/components/shared/FormField";

type Settings = {
  metaAdAccountId: string | null;
  hasMetaAdsInsightsAccessToken: boolean;
  tiktokAdvertiserId: string | null;
  hasTiktokAdsReportAccessToken: boolean;
  adsLastSyncedAt: string | null;
};

// لوحة ربط حسابات الإعلانات الحقيقية (Meta Marketing API + TikTok Marketing API) — بمجرد
// إدخال البيانات، تُسحَب أرقام النقرات والمصروف تلقائيًا لكل إعلان بدل الإدخال اليدوي.
// المزامنة التلقائية تعمل يوميًا عبر Vercel Cron، وهذه اللوحة تتيح أيضًا مزامنة فورية يدويًا.
export default function AdsAccountsSyncPanel() {
  const [open, setOpen] = useState(false);
  const [metaAdAccountId, setMetaAdAccountId] = useState("");
  const [metaAdsInsightsAccessToken, setMetaAdsInsightsAccessToken] = useState("");
  const [hasMetaAdsInsightsAccessToken, setHasMetaAdsInsightsAccessToken] = useState(false);
  const [tiktokAdvertiserId, setTiktokAdvertiserId] = useState("");
  const [tiktokAdsReportAccessToken, setTiktokAdsReportAccessToken] = useState("");
  const [hasTiktokAdsReportAccessToken, setHasTiktokAdsReportAccessToken] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/admin/site-settings")
      .then((res) => res.json())
      .then((data) => {
        const s: Settings = data.settings;
        if (!s) return;
        setMetaAdAccountId(s.metaAdAccountId ?? "");
        setHasMetaAdsInsightsAccessToken(!!s.hasMetaAdsInsightsAccessToken);
        setTiktokAdvertiserId(s.tiktokAdvertiserId ?? "");
        setHasTiktokAdsReportAccessToken(!!s.hasTiktokAdsReportAccessToken);
        setLastSyncedAt(s.adsLastSyncedAt ?? null);
      })
      .catch(() => {});
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/site-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metaAdAccountId: metaAdAccountId.trim() || null,
          ...(metaAdsInsightsAccessToken.trim() ? { metaAdsInsightsAccessToken: metaAdsInsightsAccessToken.trim() } : {}),
          tiktokAdvertiserId: tiktokAdvertiserId.trim() || null,
          ...(tiktokAdsReportAccessToken.trim() ? { tiktokAdsReportAccessToken: tiktokAdsReportAccessToken.trim() } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: data.error ?? "تعذر الحفظ" });
        return;
      }
      setMessage({ type: "success", text: "تم الحفظ بنجاح" });
    } catch {
      setMessage({ type: "error", text: "تعذر الاتصال بالخادم" });
    } finally {
      setSaving(false);
    }
  }

  async function handleSyncNow() {
    setSyncing(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/sync-ads", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: data.error ?? "تعذرت المزامنة" });
        return;
      }
      const { meta, tiktok } = data.result;
      const parts: string[] = [];
      if (meta.error) parts.push(`ميتا: ${meta.error}`);
      else parts.push(`ميتا: ${meta.synced} إعلان`);
      if (tiktok.error) parts.push(`تيك توك: ${tiktok.error}`);
      else parts.push(`تيك توك: ${tiktok.synced} إعلان`);
      setMessage({
        type: meta.error || tiktok.error ? "error" : "success",
        text: `تمت المزامنة — ${parts.join(" | ")}`,
      });
      setLastSyncedAt(new Date().toISOString());
    } catch {
      setMessage({ type: "error", text: "تعذر الاتصال بالخادم" });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="rounded-xl gold-border bg-ink p-5 space-y-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="ads-accounts-sync-panel"
        className="w-full flex items-center justify-between text-start"
      >
        <div>
          <h2 className="font-display font-semibold text-gold">🔗 ربط حسابات الإعلانات (تلقائي)</h2>
          <p className="text-xs text-cream-dim/80 mt-1">
            بعد الربط، تُسحَب النقرات والمصروف لكل إعلان تلقائيًا من Meta وTikTok — بلا إدخال يدوي.
            {lastSyncedAt && ` آخر مزامنة: ${new Date(lastSyncedAt).toLocaleString("ar-DZ-u-nu-latn")}`}
          </p>
        </div>
        <span className="text-gold text-xs shrink-0">{open ? "إخفاء ▲" : "عرض ▼"}</span>
      </button>

      {open && (
        <form id="ads-accounts-sync-panel" onSubmit={handleSave} className="space-y-4 pt-2 border-t border-gold/10">
          <div>
            <p className="text-xs text-gold font-semibold mb-2">Meta (Facebook + Instagram)</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs text-cream-dim mb-1.5 block">Ad Account ID</span>
                <input
                  type="text"
                  placeholder="act_1234567890 أو 1234567890"
                  value={metaAdAccountId}
                  onChange={(e) => setMetaAdAccountId(e.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className="text-xs text-cream-dim mb-1.5 block">Access Token (صلاحية ads_read)</span>
                <input
                  type="password"
                  placeholder={hasMetaAdsInsightsAccessToken ? "•••••••• (محفوظ، اكتب لتغييره)" : ""}
                  value={metaAdsInsightsAccessToken}
                  onChange={(e) => setMetaAdsInsightsAccessToken(e.target.value)}
                  className={inputClass}
                />
              </label>
            </div>
          </div>

          <div>
            <p className="text-xs text-gold font-semibold mb-2">TikTok</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs text-cream-dim mb-1.5 block">Advertiser ID</span>
                <input
                  type="text"
                  value={tiktokAdvertiserId}
                  onChange={(e) => setTiktokAdvertiserId(e.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className="text-xs text-cream-dim mb-1.5 block">Access Token</span>
                <input
                  type="password"
                  placeholder={hasTiktokAdsReportAccessToken ? "•••••••• (محفوظ، اكتب لتغييره)" : ""}
                  value={tiktokAdsReportAccessToken}
                  onChange={(e) => setTiktokAdsReportAccessToken(e.target.value)}
                  className={inputClass}
                />
              </label>
            </div>
          </div>

          {message && (
            <p className={`text-xs ${message.type === "success" ? "text-green-400" : "text-red-400"}`}>
              {message.text}
            </p>
          )}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="gold-gradient text-ink text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-60"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin inline" /> : "حفظ البيانات"}
            </button>
            <button
              type="button"
              onClick={handleSyncNow}
              disabled={syncing}
              className="flex items-center gap-1.5 border border-gold/30 text-gold text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-60 hover:bg-gold/10"
            >
              {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              مزامنة الآن
            </button>
          </div>
          <p className="text-[11px] text-cream-dim/80 leading-relaxed">
            ملاحظة: مهم جدًا أن يكون اسم الإعلان في Meta/TikTok Ads Manager مطابقًا لقيمة{" "}
            <code dir="ltr">utm_content</code> في رابط الإعلان، حتى يُطابَق تلقائيًا مع الطلبات
            الحقيقية. المزامنة التلقائية تعمل مرة يوميًا (حد الخطة المجانية في Vercel)، ويمكنك
            الضغط على &quot;مزامنة الآن&quot; وقتما تريد بيانات فورية.
          </p>
        </form>
      )}
    </div>
  );
}
