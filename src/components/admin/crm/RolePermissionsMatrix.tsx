"use client";

import { useState } from "react";
import { OWNER_ONLY_PERMISSIONS, ROLE_LABELS_AR, type CrmRole } from "@/lib/rbac/permissions";

// مصفوفة الأدوار × الصلاحيات — قراءة users.read، تبديل users.manage.
// خانات المالك، والصلاحيات الحصرية للمالك، ودور المشاهد نفسه غير قابلة للتبديل (قواعد الخادم).

type Matrix = { roles: readonly string[]; catalog: readonly string[]; granted: Record<string, string[]> };

export default function RolePermissionsMatrix({ initial, canManage, actorRole }: { initial: Matrix; canManage: boolean; actorRole: string }) {
  const [matrix, setMatrix] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const locked = (role: string, permission: string) =>
    !canManage || role === "owner" || role === actorRole || (OWNER_ONLY_PERMISSIONS as readonly string[]).includes(permission);

  async function toggle(role: string, permission: string, granted: boolean) {
    const key = role + ":" + permission;
    setBusy(key);
    setError(null);
    try {
      const res = await fetch("/api/admin/crm/team/permissions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, permission, granted, reason: "تعديل من مصفوفة الصلاحيات" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error ?? "تعذّر التعديل");
      else setMatrix(data.matrix);
    } catch {
      setError("تعذر الاتصال بالخادم");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-xs text-red-400" data-testid="matrix-error">{error}</p>}
      <div className="overflow-x-auto gold-border bg-ink rounded-xl">
        <table className="w-full text-xs" data-testid="role-matrix">
          <thead className="text-cream-dim">
            <tr>
              <th className="px-3 py-2 text-start sticky start-0 bg-ink">الصلاحية</th>
              {matrix.roles.map((r) => (
                <th key={r} className="px-2 py-2 text-center whitespace-nowrap">{ROLE_LABELS_AR[r as CrmRole] ?? r}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.catalog.map((p) => (
              <tr key={p} className="border-t border-gold/10">
                <td className="px-3 py-1.5 font-mono text-cream sticky start-0 bg-ink" dir="ltr">{p}</td>
                {matrix.roles.map((r) => {
                  const on = matrix.granted[r]?.includes(p) ?? false;
                  return (
                    <td key={r} className="px-2 py-1.5 text-center">
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={locked(r, p) || busy === r + ":" + p}
                        data-testid={"perm-" + r + "-" + p}
                        onChange={() => toggle(r, p, !on)}
                        className="accent-[#d4af37]"
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
