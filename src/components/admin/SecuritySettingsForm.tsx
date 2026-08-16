"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import type { PublicSiteSettings } from "@/lib/types/siteSettings";

type SecuritySettingsFormProps = {
  initialSettings: PublicSiteSettings;
  encryptionKeyMissing?: boolean;
};

export default function SecuritySettingsForm({ initialSettings, encryptionKeyMissing = false }: SecuritySettingsFormProps) {
  const [spamProtectionEnabled, setSpamProtectionEnabled] = useState(initialSettings.spamProtectionEnabled);
  const [orderLimitPerDevice, setOrderLimitPerDevice] = useState(String(initialSettings.orderLimitPerDevice));
  const [orderLimitPerPhone, setOrderLimitPerPhone] = useState(String(initialSettings.orderLimitPerPhone));
  const [orderLimitPerEmail, setOrderLimitPerEmail] = useState(String(initialSettings.orderLimitPerEmail));
  const [orderLimitPerName, setOrderLimitPerName] = useState(String(initialSettings.orderLimitPerName));
  const [orderLimitWindowMin, setOrderLimitWindowMin] = useState(String(initialSettings.orderLimitWindowMin));

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
          spamProtectionEnabled,
          orderLimitPerDevice: Number(orderLimitPerDevice),
          orderLimitPerPhone: Number(orderLimitPerPhone),
          orderLimitPerEmail: Number(orderLimitPerEmail),
          orderLimitPerName: Number(orderLimitPerName),
          orderLimitWindowMin: Number(orderLimitWindowMin),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: "error", text: data.error ?? "تعذر حفظ التغييرات" });
        return;
      }

      setMessage({ type: "success", text: "تم حفظ إعدادات الأمان بنجاح" });
    } catch {
      setMessage({ type: "error", text: "تعذر الاتصال بالخادم" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-xl rounded-xl gold-border bg-ink p-5 space-y-4">
      {encryptionKeyMissing && (
        <div className="rounded-lg border border-red-400/40 bg-red-400/10 p-3">
          <p className="text-xs text-red-300 leading-relaxed">
            ⚠️ متغير البيئة <code className="font-mono">SECRETS_ENCRYPTION_KEY</code> غير مضبوط —
            الأسرار (توكنات Meta/TikTok، مفاتيح شركات التوصيل...) تُحفظ حاليًا بلا تشفير فقاعدة
            البيانات. أضِفه من إعدادات المشروع فـVercel لتفعيل التشفير.
          </p>
        </div>
      )}
      <div className="rounded-lg border border-gold/15 p-3">
        <p className="text-xs text-cream-dim/80 leading-relaxed">
          كلمة المرور تُغيَّر من تبويب <span className="text-gold">«عام»</span> ← الحساب.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm text-cream-dim">
        <input
          type="checkbox"
          checked={spamProtectionEnabled}
          onChange={(e) => setSpamProtectionEnabled(e.target.checked)}
        />
        تفعيل الحماية ضد السپام (spam protection)
      </label>

      <div className="border-t border-gold/10 pt-4 space-y-4">
        <p className="text-xs text-cream-dim">
          حدود الطلبات (عدد الطلبات المسموحة خلال نافذة زمنية واحدة). الرقم والاسم والجهاز مُفعّلة فعليًا الآن؛
          البريد الإلكتروني محفوظ هنا للتوثيق ريثما تُضاف بيانات جمعه في استمارة الطلب.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <NumberField label="حسب رقم الهاتف" value={orderLimitPerPhone} onChange={setOrderLimitPerPhone} />
          <NumberField label="حسب اسم الزبون" value={orderLimitPerName} onChange={setOrderLimitPerName} />
          <NumberField label="حسب الجهاز" value={orderLimitPerDevice} onChange={setOrderLimitPerDevice} />
          <NumberField label="حسب البريد الإلكتروني" value={orderLimitPerEmail} onChange={setOrderLimitPerEmail} />
        </div>
        <NumberField label="النافذة الزمنية (بالدقائق)" value={orderLimitWindowMin} onChange={setOrderLimitWindowMin} />
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

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs text-cream-dim mb-1.5 block">{label}</span>
      <input
        type="number"
        min={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg bg-black border border-gold/25 px-3 py-2.5 text-sm text-cream focus:outline-none focus:border-gold transition-colors"
      />
    </label>
  );
}
