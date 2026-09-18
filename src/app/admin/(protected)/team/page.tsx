import type { Metadata } from "next";
import { requirePermission, hasPermission } from "@/lib/auth/requirePermission";
import { listTeamMembers, getRoleMatrix } from "@/server/modules/team/teamService";
import { CRM_ROLES, ROLE_LABELS_AR } from "@/lib/rbac/permissions";
import TeamMemberRow from "@/components/admin/crm/TeamMemberRow";
import InviteMemberForm from "@/components/admin/crm/InviteMemberForm";
import RolePermissionsMatrix from "@/components/admin/crm/RolePermissionsMatrix";

export const metadata: Metadata = { title: "الفريق والصلاحيات — إدارة المتجر", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

// الفريق وخريطة الصلاحيات (P8) — users.read للعرض، users.manage للتعديل (مالك فقط
// بالخريطة الافتراضية). كل إجراء يمر بالمسار (الحماية على الخادم لا في الواجهة).

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ q?: string; role?: string; active?: string }> }) {
  const admin = await requirePermission("users.read");
  const params = await searchParams;
  const role = CRM_ROLES.includes(params.role as (typeof CRM_ROLES)[number]) ? (params.role as (typeof CRM_ROLES)[number]) : undefined;
  const active = params.active === "true" ? true : params.active === "false" ? false : undefined;
  const [members, matrix, canManage] = await Promise.all([
    listTeamMembers({ q: params.q?.trim() || undefined, role, active }),
    getRoleMatrix(),
    hasPermission("users.manage"),
  ]);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-bold text-cream">الفريق والصلاحيات</h1>
          <p className="text-sm text-cream-dim">{members.length} عضو · الأدوار من الكتالوج الرسمي؛ التغييرات موثّقة في سجل التدقيق</p>
        </div>
        {canManage ? <InviteMemberForm /> : <span className="text-xs text-cream-dim">قراءة فقط — إدارة الفريق للمالك</span>}
      </header>

      <form action="/admin/team" className="flex flex-wrap gap-2 text-sm">
        <input type="search" name="q" defaultValue={params.q} placeholder="بحث بالبريد أو الاسم" className="rounded-lg border border-gold/25 bg-ink px-3 py-2 text-cream" />
        <select name="role" defaultValue={params.role ?? ""} className="rounded-lg border border-gold/25 bg-ink px-3 py-2 text-cream">
          <option value="">كل الأدوار</option>
          {CRM_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS_AR[r]}</option>)}
        </select>
        <select name="active" defaultValue={params.active ?? ""} className="rounded-lg border border-gold/25 bg-ink px-3 py-2 text-cream">
          <option value="">الكل</option>
          <option value="true">نشط</option>
          <option value="false">معطّل</option>
        </select>
        <button className="border border-gold/25 text-gold px-4 py-2 rounded-lg">تصفية</button>
      </form>

      <div className="overflow-x-auto gold-border bg-ink rounded-xl">
        <table className="w-full text-sm" data-testid="team-table">
          <thead className="text-cream-dim text-xs">
            <tr>
              <th className="px-4 py-3 text-start">العضو</th>
              <th className="px-4 py-3 text-start">الدور</th>
              <th className="px-4 py-3 text-start">الحالة</th>
              <th className="px-4 py-3 text-start">آخر دخول (UTC)</th>
              <th className="px-4 py-3 text-start"></th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <TeamMemberRow
                key={m.id}
                member={{ ...m, lastLoginAt: m.lastLoginAt?.toISOString() ?? null, createdAt: m.createdAt.toISOString() }}
                canManage={canManage}
                isSelf={m.id === admin.id}
              />
            ))}
          </tbody>
        </table>
      </div>

      <section className="space-y-3">
        <h2 className="font-display font-semibold text-gold">مصفوفة الصلاحيات</h2>
        <p className="text-xs text-cream-dim">
          المرجع النهائي role_permissions في القاعدة (رفض افتراضي). صلاحيات المالك ثابتة؛ الصلاحيات الحصرية للمالك (users.manage، settings.manage، integrations.manage، is_test.manage، customers.anonymize) لا تُمنح لدور آخر؛ لا أحد يعدّل دوره هو. صلاحية جديدة في الكتالوج تحتاج migration.
        </p>
        <RolePermissionsMatrix initial={matrix} canManage={canManage} actorRole={admin.role} />
      </section>
    </div>
  );
}
