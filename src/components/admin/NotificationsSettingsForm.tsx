"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import type { PublicSiteSettings } from "@/lib/types/siteSettings";

type NotificationsSettingsFormProps = {
  initialSettings: PublicSiteSettings;
  // TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID مضبوطان على الخادم (راجع lib/ownerNotify.ts)
  channelConfigured: boolean;
};

export default function NotificationsSettingsForm({ initialSettings, channelConfigured }: NotificationsSettingsFormProps) {
  const [notifyOrders, setNotifyOrders] = useState(initialSettings.notifyOrders);
  const [notifyPlatformUpdates, setNotifyPlatformUpdates] = useState(initialSettings.notifyPlatformUpdates);
  const [notifyAlerts, setNotifyAlerts] = useState(initialSettings.notifyAlerts);
  const [notifySystem, setNotifySystem] = useState(initialSettings.notifySystem);

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
        body: JSON.stringify({ notifyOrders, notifyPlatformUpdates, notifyAlerts, notifySystem }),
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
        تصلك على Telegram (نفس بوت الوكيل الذكي).{" "}
        {channelConfigured ? (
          <span className="text-green-400">القناة مضبوطة ✓</span>
        ) : (
          <span className="text-red-400">
            القناة غير مضبوطة — أضف TELEGRAM_BOT_TOKEN وTELEGRAM_CHAT_ID في متغيرات بيئة Vercel.
          </span>
        )}
      </p>

      <ToggleRow
        label="إشعارات الطلبيات"
        description="طلب جديد (الاسم، الهاتف، الولاية، المنتجات، المجموع) وكل تغيّر في حالته"
        checked={notifyOrders}
        onChange={setNotifyOrders}
      />
      <ToggleRow
        label="التنبيهات"
        description="مخزون منخفض أو نافد بعد طلب، محاولات دخول مشبوهة على لوحة التحكم"
        checked={notifyAlerts}
        onChange={setNotifyAlerts}
      />
      <ToggleRow
        label="إشعارات النظام"
        description="أعطال تقنية: webhook معطّل، تعطّل الحماية من السبام، مهام فاشلة، تعارض حالة الشحن"
        checked={notifySystem}
        onChange={setNotifySystem}
      />
      <ToggleRow
        label="تحديثات المنصة"
        description="ميزات جديدة على لوحة التحكم — لا يوجد مصدر لها حاليًا، المفتاح محفوظ فقط"
        checked={notifyPlatformUpdates}
        onChange={setNotifyPlatformUpdates}
      />

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

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-4 border-b border-gold/10 pb-4 last:border-0 last:pb-0 cursor-pointer">
      <span>
        <span className="block text-sm text-cream">{label}</span>
        <span className="block text-xs text-cream-dim/80 mt-0.5">{description}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 shrink-0"
      />
    </label>
  );
}
