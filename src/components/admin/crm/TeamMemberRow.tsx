"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CRM_ROLES, ROLE_LABELS_AR } from "@/lib/rbac/permissions";

// صف عضو فريق — تغيير الدور/التفعيل عبر PATCH (users.manage). الحماية على الخادم؛
// التعطيل هنا مجرد إخفاء واجهة (الذات، ومن لا يملك الصلاحية).

type Member = { id: string; email: string; fullName: string | null; role: string; isActive: boolean; lastLoginAt: string | null; createdAt: string };

export default function TeamMemberRow({ member, canManage, isSelf }: { member: Member; canManage: boolean; isSelf: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editable = canManage && !isSelf;

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/crm/team/" + member.id, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "تعذّر الحفظ");
      else router.refresh();
    } catch {
      setError("تعذر الاتصال بالخادم");
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className="border-t border-gold/10 align-top" data-testid={"team-row-" + member.id}>
      <td className="px-4 py-3">
        <div className="text-cream">{member.fullName ?? "—"}{isSelf && <span className="ms-2 text-xs text-gold">(أنت)</span>}</div>
        <div className="text-xs text-cream-dim" dir="ltr">{member.email}</div>
      </td>
      <td className="px-4 py-3">
        {editable ? (
          <select
            value={member.role}
            disabled={busy}
            data-testid={"team-role-" + member.id}
            onChange={(e) => patch({ role: e.target.value, reason: "تغيير الدور من صفحة الفريق" })}
            className="rounded-lg border border-gold/25 bg-ink px-2 py-1 text-sm text-cream"
          >
            {!CRM_ROLES.includes(member.role as (typeof CRM_ROLES)[number]) && <option value={member.role}>{member.role} (قديم)</option>}
            {CRM_ROLES.map((r) => (
              <option key={r} value={r}>{ROLE_LABELS_AR[r]}</option>
            ))}
          </select>
        ) : (
          <span className="text-sm text-cream">{ROLE_LABELS_AR[member.role as keyof typeof ROLE_LABELS_AR] ?? member.role}</span>
        )}
      </td>
      <td className="px-4 py-3 text-sm">
        <span className={member.isActive ? "text-emerald-400" : "text-red-400"} data-testid={"team-status-" + member.id}>{member.isActive ? "نشط" : "معطّل"}</span>
      </td>
      <td className="px-4 py-3 font-mono text-xs text-cream-dim" dir="ltr">{member.lastLoginAt ? member.lastLoginAt.replace("T", " ").slice(0, 16) : "—"}</td>
      <td className="px-4 py-3">
        {editable && (
          <button
            type="button"
            disabled={busy}
            data-testid={"team-toggle-" + member.id}
            onClick={() => {
              if (member.isActive && !confirm("تعطيل حساب " + member.email + "؟ لن يتمكن من الدخول فورًا.")) return;
              patch({ isActive: !member.isActive, reason: member.isActive ? "تعطيل من صفحة الفريق" : "تفعيل من صفحة الفريق" });
            }}
            className="border border-gold/25 text-gold text-xs font-semibold px-3 py-1 rounded-lg hover:bg-gold/10 disabled:opacity-60"
          >
            {member.isActive ? "تعطيل" : "تفعيل"}
          </button>
        )}
        {error && <span className="ms-2 text-xs text-red-400" data-testid={"team-error-" + member.id}>{error}</span>}
      </td>
    </tr>
  );
}
