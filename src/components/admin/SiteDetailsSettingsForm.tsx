"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import type { PublicSiteSettings } from "@/lib/types/siteSettings";
import UrlFieldWithOpen from "./UrlFieldWithOpen";
import { Field, inputClass } from "@/components/shared/FormField";

type SiteDetailsSettingsFormProps = {
  initialSettings: PublicSiteSettings;
};

export default function SiteDetailsSettingsForm({ initialSettings }: SiteDetailsSettingsFormProps) {
  const [logoUrl, setLogoUrl] = useState(initialSettings.logoUrl ?? "");
  const [faviconUrl, setFaviconUrl] = useState(initialSettings.faviconUrl ?? "");
  const [announcementBarEnabled, setAnnouncementBarEnabled] = useState(
    initialSettings.announcementBarEnabled,
  );
  const [announcementBarText, setAnnouncementBarText] = useState(
    initialSettings.announcementBarText ?? "",
  );
  const [instagramUrl, setInstagramUrl] = useState(initialSettings.instagramUrl ?? "");
  const [facebookUrl, setFacebookUrl] = useState(initialSettings.facebookUrl ?? "");
  const [tiktokUrl, setTiktokUrl] = useState(initialSettings.tiktokUrl ?? "");

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/admin/site-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          logoUrl: logoUrl || null,
          faviconUrl: faviconUrl || null,
          announcementBarEnabled,
          announcementBarText: announcementBarText || null,
          instagramUrl: instagramUrl || null,
          facebookUrl: facebookUrl || null,
          tiktokUrl: tiktokUrl || null,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: "error", text: data.error ?? "تعذر حفظ التغييرات" });
        return;
      }

      setMessage({ type: "success", text: "تم حفظ التغييرات بنجاح" });
    } catch {
      setMessage({ type: "error", text: "تعذر الاتصال بالخادم" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-xl rounded-xl gold-border bg-ink p-5 space-y-4">
      <Field label="رابط الشعار (Logo)">
        <UrlFieldWithOpen
          value={logoUrl}
          onChange={setLogoUrl}
          placeholder="اتركه فارغًا لاستخدام الشعار الافتراضي"
        />
      </Field>

      <Field label="رابط الأيقونة (Favicon)">
        <UrlFieldWithOpen
          value={faviconUrl}
          onChange={setFaviconUrl}
          placeholder="اتركه فارغًا لاستخدام الأيقونة الافتراضية"
        />
      </Field>

      <div className="border-t border-gold/10 pt-4 space-y-3">
        <label className="flex items-center gap-2 text-sm text-cream-dim">
          <input
            type="checkbox"
            checked={announcementBarEnabled}
            onChange={(e) => setAnnouncementBarEnabled(e.target.checked)}
          />
          تفعيل شريط الإعلانات
        </label>
        <Field label="نص شريط الإعلانات">
          <input
            type="text"
            placeholder="مثال: توصيل مجاني لجميع الطلبات هذا الأسبوع"
            value={announcementBarText}
            onChange={(e) => setAnnouncementBarText(e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>

      <div className="border-t border-gold/10 pt-4 space-y-4">
        <p className="text-xs text-cream-dim">روابط السوشيال ميديا</p>
        <Field label="إنستغرام">
          <UrlFieldWithOpen value={instagramUrl} onChange={setInstagramUrl} />
        </Field>
        <Field label="فيسبوك">
          <UrlFieldWithOpen value={facebookUrl} onChange={setFacebookUrl} />
        </Field>
        <Field label="تيك توك">
          <UrlFieldWithOpen
            value={tiktokUrl}
            onChange={setTiktokUrl}
            placeholder="https://www.tiktok.com/@..."
          />
        </Field>
      </div>

      {message && (
        <p className={`text-xs ${message.type === "success" ? "text-green-400" : "text-red-400"}`}>
          {message.text}
        </p>
      )}

      <button
        type="submit"
        disabled={saving}
        className="w-full gold-gradient text-ink font-bold py-3 rounded-xl disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "حفظ التغييرات"}
      </button>
    </form>
  );
}
