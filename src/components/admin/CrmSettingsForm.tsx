"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

// تحرير إعدادات CRM التشغيلية — عتبات التجزئة وأوزان المخاطر وعتبات الاحتيال
// وSLA المهام. الحقول تُشتق من القيم نفسها لا من قائمة مكتوبة يدويًا، فإضافة
// مفتاح جديد في crmSettingsSchema تظهر هنا تلقائيًا بلا تعديل هذا الملف.
//
// التحقق النهائي دائمًا على الخادم (zod داخل setCrmSetting) — ما هنا مساعدة
// إدخال فقط، ورسالة الخطأ المعروضة هي رسالة الخادم لا نصًا محليًا يخمّنها.

type SettingsMap = Record<string, unknown>;

const KEY_LABELS: Record<string, string> = {
  risk_weights: "أوزان محرك المخاطر",
  risk_thresholds: "عتبات مستويات المخاطر",
  segmentation_thresholds: "عتبات تجزئة العملاء",
  fraud_thresholds: "عتبات كشف الاحتيال",
  task_sla_minutes: "مهل المهام (بالدقائق)",
  packaging_cost_dzd: "تكلفة التغليف الافتراضية (دج)",
  attribution_window_days: "نافذة العزو (أيام)",
  export_max_rows: "الحد الأقصى لصفوف التصدير",
  automation_enabled: "تفعيل الأتمتة لكل معالِج",
};

export default function CrmSettingsForm({ initialSettings }: { initialSettings: SettingsMap }) {
  const [settings, setSettings] = useState<SettingsMap>(initialSettings);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<{ key: string; type: "success" | "error"; text: string } | null>(null);

  function fieldValue(key: string, field: string): string {
    const draftKey = `${key}.${field}`;
    if (draftKey in drafts) return drafts[draftKey];
    const record = settings[key] as Record<string, unknown>;
    return String(record?.[field] ?? "");
  }

  async function save(key: string, value: unknown) {
    setSavingKey(key);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/crm/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ key, type: "error", text: data.error ?? "تعذّر الحفظ" });
        return;
      }
      setSettings(data.settings);
      setDrafts((prev) => {
        const next = { ...prev };
        for (const k of Object.keys(next)) if (k.startsWith(`${key}.`)) delete next[k];
        return next;
      });
      setMessage({ key, type: "success", text: "حُفظ" });
    } catch {
      setMessage({ key, type: "error", text: "تعذّر الاتصال بالخادم" });
    } finally {
      setSavingKey(null);
    }
  }

  function saveObject(key: string) {
    const record = settings[key] as Record<string, unknown>;
    const next: Record<string, unknown> = {};
    for (const field of Object.keys(record)) {
      const raw = fieldValue(key, field);
      next[field] = typeof record[field] === "number" ? Number(raw) : raw;
    }
    void save(key, next);
  }

  return (
    <div className="space-y-8">
      <p className="text-sm text-cream-dim">
        كل قيمة هنا تُقرأ مباشرةً من قِبل محركات المخاطر والتجزئة والاحتيال. التحقق يجري على
        الخادم، وكل تغيير يُسجَّل في سجل التدقيق بقيمته قبل وبعد.
      </p>

      {Object.entries(settings).map(([key, value]) => {
        const isObject = value !== null && typeof value === "object" && !Array.isArray(value);
        const record = value as Record<string, unknown>;

        return (
          <section key={key} className="gold-border rounded-xl bg-ink p-4" data-testid={`crm-setting-${key}`}>
            <h3 className="font-display font-semibold text-gold mb-3">{KEY_LABELS[key] ?? key}</h3>

            {isObject ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  {Object.keys(record).map((field) => (
                    <label key={field} className="text-sm">
                      <span className="block text-cream-dim mb-1">{field}</span>
                      <input
                        type={typeof record[field] === "number" ? "number" : "text"}
                        step="any"
                        value={fieldValue(key, field)}
                        onChange={(e) =>
                          setDrafts((prev) => ({ ...prev, [`${key}.${field}`]: e.target.value }))
                        }
                        data-testid={`crm-setting-${key}-${field}`}
                        className="w-full rounded-lg border border-neutral-700 bg-transparent px-3 py-2 text-cream"
                      />
                    </label>
                  ))}
                </div>
                <button
                  onClick={() => saveObject(key)}
                  disabled={savingKey === key}
                  data-testid={`crm-setting-save-${key}`}
                  className="mt-3 inline-flex items-center gap-2 rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-ink disabled:opacity-60"
                >
                  {savingKey === key && <Loader2 className="w-4 h-4 animate-spin" />}
                  حفظ
                </button>
              </>
            ) : (
              <div className="flex flex-wrap items-end gap-3">
                <label className="text-sm">
                  <span className="block text-cream-dim mb-1">القيمة</span>
                  <input
                    type={typeof value === "number" ? "number" : "text"}
                    value={`${key}` in drafts ? drafts[key] : String(value ?? "")}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [key]: e.target.value }))}
                    data-testid={`crm-setting-value-${key}`}
                    className="rounded-lg border border-neutral-700 bg-transparent px-3 py-2 text-cream"
                  />
                </label>
                <button
                  onClick={() =>
                    void save(key, typeof value === "number" ? Number(drafts[key] ?? value) : drafts[key] ?? value)
                  }
                  disabled={savingKey === key}
                  data-testid={`crm-setting-save-${key}`}
                  className="inline-flex items-center gap-2 rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-ink disabled:opacity-60"
                >
                  {savingKey === key && <Loader2 className="w-4 h-4 animate-spin" />}
                  حفظ
                </button>
              </div>
            )}

            {message?.key === key && (
              <p
                data-testid={`crm-setting-message-${key}`}
                className={`mt-2 text-sm ${message.type === "success" ? "text-green-400" : "text-red-400"}`}
              >
                {message.text}
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
