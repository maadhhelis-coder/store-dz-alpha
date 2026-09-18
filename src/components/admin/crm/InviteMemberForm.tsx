"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CRM_ROLES, ROLE_LABELS_AR } from "@/lib/rbac/permissions";

// دعوة عضو (users.manage) — Supabase Auth يرسل رابط الدعوة بإعداداته؛ حساب Auth
// موجود بنفس البريد يُربط بدل رفضه. 503 = مفتاح service role غير مضبوط.

export default function InviteMemberForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<string>("viewer");

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/crm/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), fullName: fullName.trim() || null, role }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "تعذّرت الدعوة");
        return;
      }
      setNotice(data.outcome === "invited" ? "أُرسلت دعوة إلى " + email.trim() + " عبر Supabase Auth" : "رُبط حساب Auth الموجود لـ" + email.trim());
      setEmail("");
      setFullName("");
      setOpen(false);
      router.refresh();
    } catch {
      setError("تعذر الاتصال بالخادم");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      {!open ? (
        <button type="button" data-testid="invite-open" onClick={() => setOpen(true)} className="gold-gradient text-ink text-xs font-semibold px-3 py-2 rounded-lg">
          دعوة عضو جديد
        </button>
      ) : (
        <div className="gold-border bg-ink rounded-xl p-4 flex flex-wrap items-end gap-3" data-testid="invite-form">
          <label className="text-xs text-cream-dim">البريد
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" data-testid="invite-email" className="block mt-1 rounded-lg border border-gold/25 bg-ink px-2 py-1 text-sm text-cream" />
          </label>
          <label className="text-xs text-cream-dim">الاسم
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="block mt-1 rounded-lg border border-gold/25 bg-ink px-2 py-1 text-sm text-cream" />
          </label>
          <label className="text-xs text-cream-dim">الدور
            <select value={role} onChange={(e) => setRole(e.target.value)} data-testid="invite-role" className="block mt-1 rounded-lg border border-gold/25 bg-ink px-2 py-1 text-sm text-cream">
              {CRM_ROLES.filter((r) => r !== "owner").map((r) => (
                <option key={r} value={r}>{ROLE_LABELS_AR[r]}</option>
              ))}
            </select>
          </label>
          <button type="button" disabled={busy || !email.trim()} onClick={submit} data-testid="invite-submit" className="gold-gradient text-ink text-xs font-semibold px-3 py-2 rounded-lg disabled:opacity-60">إرسال الدعوة</button>
          <button type="button" onClick={() => setOpen(false)} className="text-xs text-cream-dim">إلغاء</button>
        </div>
      )}
      {error && <p className="text-xs text-red-400" data-testid="invite-error">{error}</p>}
      {notice && <p className="text-xs text-emerald-400" data-testid="invite-notice">{notice}</p>}
    </div>
  );
}
