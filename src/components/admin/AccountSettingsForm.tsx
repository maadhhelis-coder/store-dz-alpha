"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Field, inputClass } from "@/components/shared/FormField";

type AccountSettingsFormProps = {
  email: string;
  initialFullName: string | null;
};

export default function AccountSettingsForm({ email, initialFullName }: AccountSettingsFormProps) {
  const [fullName, setFullName] = useState(initialFullName ?? "");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (newPassword && newPassword !== confirmPassword) {
      setMessage({ type: "error", text: "كلمتا المرور غير متطابقتين" });
      return;
    }

    setSaving(true);

    const payload: { fullName?: string; newPassword?: string } = {};
    if (fullName.trim() && fullName.trim() !== (initialFullName ?? "")) payload.fullName = fullName.trim();
    if (newPassword) payload.newPassword = newPassword;

    if (Object.keys(payload).length === 0) {
      setSaving(false);
      setMessage({ type: "error", text: "لا توجد تغييرات لحفظها" });
      return;
    }

    try {
      const res = await fetch("/api/admin/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: "error", text: data.error ?? "تعذر حفظ التغييرات" });
        return;
      }

      setNewPassword("");
      setConfirmPassword("");
      setMessage({ type: "success", text: "تم حفظ التغييرات بنجاح" });
    } catch {
      setMessage({ type: "error", text: "تعذر الاتصال بالخادم" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md rounded-xl gold-border bg-ink p-5 space-y-4">
      <Field label="البريد الإلكتروني">
        <input type="text" value={email} disabled className={inputClass + " opacity-60"} dir="ltr" />
      </Field>

      <Field label="الاسم الكامل">
        <input
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className={inputClass}
        />
      </Field>

      <div className="border-t border-gold/10 pt-4 space-y-4">
        <p className="text-xs text-cream-dim">تغيير كلمة المرور (اتركها فارغة إذا لا تريد تغييرها)</p>
        <Field label="كلمة المرور الجديدة">
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className={inputClass}
            autoComplete="new-password"
          />
        </Field>
        <Field label="تأكيد كلمة المرور">
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={inputClass}
            autoComplete="new-password"
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
