"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { PublicSiteSettings } from "@/lib/types/siteSettings";
import { Field, inputClassLtr as inputClass } from "@/components/shared/FormField";

type TrackingPixelsSettingsFormProps = {
  initialSettings: PublicSiteSettings;
};

export default function TrackingPixelsSettingsForm({ initialSettings }: TrackingPixelsSettingsFormProps) {
  const [metaPixelId, setMetaPixelId] = useState(initialSettings.metaPixelId ?? "");
  // حقول التوكنات تبدأ فارغة دائمًا — القيمة الفعلية لا تُرسَل للمتصفح أبدًا (راجع
  // maskAdTokens فـ /api/admin/site-settings)، فقط إشارة hasX تتحكم فنص العنصر النائب.
  const [metaCapiAccessToken, setMetaCapiAccessToken] = useState("");
  const [hasMetaCapiAccessToken, setHasMetaCapiAccessToken] = useState(false);
  const [tiktokPixelId, setTiktokPixelId] = useState(initialSettings.tiktokPixelId ?? "");
  const [tiktokEventsApiAccessToken, setTiktokEventsApiAccessToken] = useState("");
  const [hasTiktokEventsApiAccessToken, setHasTiktokEventsApiAccessToken] = useState(false);
  const [googleTagId, setGoogleTagId] = useState(initialSettings.googleTagId ?? "");
  const [snapchatPixelId, setSnapchatPixelId] = useState(initialSettings.snapchatPixelId ?? "");

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // نجلب القيم الحالية مباشرة من الخادم عند فتح النموذج — حماية إضافية من أي بيانات
  // قديمة قد تصل عبر الخصائص الأولية (مثلاً بسبب تخزين مؤقت أو تبويب مفتوح من قبل)،
  // حتى لا يحفظ النموذج عن طريق الخطأ حقولاً فارغة فوق قيم حقيقية محفوظة مسبقًا.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/site-settings")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || !data.settings) return;
        setMetaPixelId(data.settings.metaPixelId ?? "");
        setHasMetaCapiAccessToken(!!data.settings.hasMetaCapiAccessToken);
        setTiktokPixelId(data.settings.tiktokPixelId ?? "");
        setHasTiktokEventsApiAccessToken(!!data.settings.hasTiktokEventsApiAccessToken);
        setGoogleTagId(data.settings.googleTagId ?? "");
        setSnapchatPixelId(data.settings.snapchatPixelId ?? "");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/admin/site-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metaPixelId: metaPixelId.trim() || null,
          ...(metaCapiAccessToken.trim() ? { metaCapiAccessToken: metaCapiAccessToken.trim() } : {}),
          tiktokPixelId: tiktokPixelId.trim() || null,
          ...(tiktokEventsApiAccessToken.trim() ? { tiktokEventsApiAccessToken: tiktokEventsApiAccessToken.trim() } : {}),
          googleTagId: googleTagId.trim() || null,
          snapchatPixelId: snapchatPixelId.trim() || null,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: "error", text: data.error ?? "تعذر حفظ التغييرات" });
        return;
      }

      setMessage({ type: "success", text: "تم حفظ إعدادات البيكسلات بنجاح — ستظهر في الموقع خلال دقيقة تقريبًا" });
    } catch {
      setMessage({ type: "error", text: "تعذر الاتصال بالخادم" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-xl rounded-xl gold-border bg-ink p-5 space-y-4">
      <p className="text-xs text-cream-dim/80 leading-relaxed">
        اربط بيكسلات التتبع لحملاتك الإعلانية. بمجرد إدخال المعرّف (ID)، يُضاف الكود تلقائيًا لكل صفحات
        المتجر، وتُسجَّل زيارة الصفحة (PageView) تلقائيًا، وحدث الشراء (Purchase) عند تأكيد أي طلب حقيقي.
      </p>

      <Field label="Meta Pixel ID (فيسبوك / انستغرام)">
        <input
          type="text"
          dir="ltr"
          placeholder="مثال: 1234567890123456"
          value={metaPixelId}
          onChange={(e) => setMetaPixelId(e.target.value)}
          className={inputClass}
        />
        <p className="text-[11px] text-cream-dim/80 mt-1.5">
          تجده في Meta Events Manager ← مصادر البيانات ← البيكسل الخاص بك.
        </p>
      </Field>

      <Field label="Meta Conversions API — Access Token (اختياري، لإرسال بيانات المبيعات الحقيقية لميتا)">
        <input
          type="password"
          dir="ltr"
          placeholder={hasMetaCapiAccessToken ? "•••••••• (محفوظ، اكتب لتغييره)" : "EAAxxxxxxxxxxxxx..."}
          value={metaCapiAccessToken}
          onChange={(e) => setMetaCapiAccessToken(e.target.value)}
          className={inputClass}
        />
        <p className="text-[11px] text-cream-dim/80 mt-1.5">
          من نفس صفحة Meta Events Manager ← اختر البيكسل ← الإعدادات ← Conversions API ← إنشاء رمز
          وصول (Generate Access Token). عند إضافته، تُرسَل أحداث &quot;طلب جديد&quot; و&quot;طلب مؤكد&quot; و&quot;طلب مُسلَّم&quot;
          مباشرة من السيرفر لميتا لتحسين استهداف إعلاناتك.
        </p>
      </Field>

      <Field label="TikTok Pixel ID">
        <input
          type="text"
          dir="ltr"
          placeholder="مثال: CXXXXXXXXXXXXXXXXXXX"
          value={tiktokPixelId}
          onChange={(e) => setTiktokPixelId(e.target.value)}
          className={inputClass}
        />
        <p className="text-[11px] text-cream-dim/80 mt-1.5">
          تجده في TikTok Ads Manager ← Events ← Web Events ← معرّف البيكسل.
        </p>
      </Field>

      <Field label="TikTok Events API — Access Token (اختياري، لإرسال بيانات المبيعات الحقيقية لتيك توك)">
        <input
          type="password"
          dir="ltr"
          placeholder={hasTiktokEventsApiAccessToken ? "•••••••• (محفوظ، اكتب لتغييره)" : "أدخل رمز الوصول من TikTok Ads Manager"}
          value={tiktokEventsApiAccessToken}
          onChange={(e) => setTiktokEventsApiAccessToken(e.target.value)}
          className={inputClass}
        />
        <p className="text-[11px] text-cream-dim/80 mt-1.5">
          من TikTok Ads Manager ← Events ← Web Events ← اختر البيكسل ← الإعدادات ← Generate Access
          Token. عند إضافته، تُرسَل أحداث &quot;طلب جديد&quot; و&quot;طلب مؤكد&quot; و&quot;طلب مُسلَّم&quot; مباشرة من السيرفر
          لتيك توك.
        </p>
      </Field>

      <Field label="Google Tag ID (GA4 أو Google Ads)">
        <input
          type="text"
          dir="ltr"
          placeholder="مثال: G-XXXXXXXXXX أو AW-XXXXXXXXX"
          value={googleTagId}
          onChange={(e) => setGoogleTagId(e.target.value)}
          className={inputClass}
        />
        <p className="text-[11px] text-cream-dim/80 mt-1.5">
          معرّف قياس Google Analytics 4 أو معرّف تحويل Google Ads. تنبيه: تتبّع الأحداث هنا
          مبني لـ GA4 (يبدأ بـ G-) — لو أدخلت معرّف Google Ads (يبدأ بـ AW-) فلن تُسجَّل
          تحويلاته تلقائيًا (تتبّع تحويلات Google Ads يحتاج ربط منفصل عبر Google Tag Manager
          أو Google Ads Conversion Linker).
        </p>
      </Field>

      <Field label="Snapchat Pixel ID">
        <input
          type="text"
          dir="ltr"
          placeholder="مثال: 12345678-1234-1234-1234-123456789012"
          value={snapchatPixelId}
          onChange={(e) => setSnapchatPixelId(e.target.value)}
          className={inputClass}
        />
        <p className="text-[11px] text-cream-dim/80 mt-1.5">
          تجده في Snapchat Ads Manager ← Events Manager.
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
