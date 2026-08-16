"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import type { PublicSiteSettings } from "@/lib/types/siteSettings";
import UrlFieldWithOpen from "./UrlFieldWithOpen";
import { Field } from "@/components/shared/FormField";

type DomainSettingsFormProps = {
  initialSettings: PublicSiteSettings;
};

export default function DomainSettingsForm({ initialSettings }: DomainSettingsFormProps) {
  const [storeDomain, setStoreDomain] = useState(initialSettings.storeDomain ?? "");
  const [funnelsDomain, setFunnelsDomain] = useState(initialSettings.funnelsDomain ?? "");

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
          storeDomain: storeDomain || null,
          funnelsDomain: funnelsDomain || null,
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
      <p className="text-xs text-cream-dim/80 leading-relaxed">
        هذه الحقول لتسجيل النطاق المخصص فقط. لتفعيله فعليًا، يجب أولًا شراء النطاق ثم ربطه من إعدادات
        Vercel (Domains) وتوجيه سجلات DNS إليه — الحقول هنا للتوثيق والمرجعية داخل لوحة التحكم.
      </p>

      <Field label="نطاق المتجر">
        <UrlFieldWithOpen
          value={storeDomain}
          onChange={setStoreDomain}
          placeholder="example.com"
          autoPrefixHttps
        />
      </Field>

      <Field label="نطاق صفحات الهبوط (اختياري)">
        <UrlFieldWithOpen
          value={funnelsDomain}
          onChange={setFunnelsDomain}
          placeholder="offers.example.com"
          autoPrefixHttps
        />
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
