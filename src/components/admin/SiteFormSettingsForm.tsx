"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import type { PublicSiteSettings } from "@/lib/types/siteSettings";
import UrlFieldWithOpen from "./UrlFieldWithOpen";
import { Field, inputClass } from "@/components/shared/FormField";

type SiteFormSettingsFormProps = {
  initialSettings: PublicSiteSettings;
};

export default function SiteFormSettingsForm({ initialSettings }: SiteFormSettingsFormProps) {
  const [privacyPolicyText, setPrivacyPolicyText] = useState(initialSettings.privacyPolicyText ?? "");
  const [thankYouMessage, setThankYouMessage] = useState(initialSettings.thankYouMessage ?? "");
  const [thankYouPageUrl, setThankYouPageUrl] = useState(initialSettings.thankYouPageUrl ?? "");

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
          privacyPolicyText: privacyPolicyText || null,
          thankYouMessage: thankYouMessage || null,
          thankYouPageUrl: thankYouPageUrl || null,
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
      <Field label="سياسة الخصوصية">
        <textarea
          rows={6}
          placeholder="نص سياسة الخصوصية الذي يظهر رابطًا صغيرًا أسفل استمارة الطلب"
          value={privacyPolicyText}
          onChange={(e) => setPrivacyPolicyText(e.target.value)}
          className={inputClass}
        />
      </Field>

      <Field label="رسالة الشكر (تظهر بعد إتمام الطلب مباشرة)">
        <textarea
          rows={2}
          placeholder="مثال: شكرًا لطلبك! سنتواصل معك قريبًا لتأكيد التوصيل."
          value={thankYouMessage}
          onChange={(e) => setThankYouMessage(e.target.value)}
          className={inputClass}
        />
      </Field>

      <Field label="رابط صفحة الشكر (اختياري)">
        <UrlFieldWithOpen
          value={thankYouPageUrl}
          onChange={setThankYouPageUrl}
          placeholder="اتركه فارغًا لعرض رسالة الشكر داخل النافذة بدلاً من التحويل"
        />
        <p className="text-[11px] text-cream-dim/80 mt-1.5">
          إذا تم تعبئته، سيُحوَّل الزبون لهذا الرابط مباشرة بعد نجاح الطلب بدل عرض رسالة الشكر.
        </p>
      </Field>

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
