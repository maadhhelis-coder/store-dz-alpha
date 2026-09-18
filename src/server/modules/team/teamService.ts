import { Prisma, type AdminRole, type AdminUser } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { writeAuditInTx } from "@/server/services/auditService";
import { getSupabaseAdmin } from "@/lib/supabaseAdminClient";
import { CRM_ROLES, PERMISSION_CATALOG } from "@/lib/rbac/permissions";
import { validateRolePermissionChange, validateTeamUpdate, TeamRuleError } from "@/lib/rbac/teamRules";

// إدارة الفريق وخريطة الصلاحيات (P8) — فوق admin_users وrole_permissions القائمين.
// التفويض (users.read / users.manage) على المسار؛ القواعد الصرفة في lib/rbac/teamRules.
// كل تعديل مميّز يُوثَّق داخل نفس المعاملة (writeAuditInTx) — الفعل والسجل معًا أو لا شيء.

export { TeamRuleError };

export class TeamMemberNotFoundError extends Error {
  constructor() {
    super("عضو الفريق غير موجود");
    this.name = "TeamMemberNotFoundError";
  }
}

export class TeamMemberExistsError extends Error {
  constructor(email: string) {
    super(`يوجد عضو فريق بهذا البريد مسبقًا: ${email}`);
    this.name = "TeamMemberExistsError";
  }
}

export type TeamMember = Pick<AdminUser, "id" | "email" | "fullName" | "role" | "isActive" | "lastLoginAt" | "createdAt">;

const MEMBER_SELECT = { id: true, email: true, fullName: true, role: true, isActive: true, lastLoginAt: true, createdAt: true } as const;

// ponytail: فريق CRM صغير (عشرات) — بلا ترقيم؛ حد 500 صف يحمي من انفجار غير متوقع.
export async function listTeamMembers(params: { q?: string; role?: AdminRole; active?: boolean } = {}): Promise<TeamMember[]> {
  return prisma.adminUser.findMany({
    where: {
      ...(params.role ? { role: params.role } : {}),
      ...(params.active === undefined ? {} : { isActive: params.active }),
      ...(params.q
        ? { OR: [{ email: { contains: params.q, mode: "insensitive" } }, { fullName: { contains: params.q, mode: "insensitive" } }] }
        : {}),
    },
    select: MEMBER_SELECT,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 500,
  });
}

/** تعديل دور/حالة/اسم عضو — يقفل صف الهدف (FOR UPDATE) كي لا يُخفَّض مالكان
 * متزامنان بعضهما فيبقى النظام بلا مالك. */
export async function updateTeamMember(params: {
  id: string;
  actor: AdminUser;
  patch: { role?: string; isActive?: boolean; fullName?: string | null };
  reason?: string | null;
}): Promise<TeamMember> {
  return prisma.$transaction(async (tx) => {
    const [target] = await tx.$queryRaw<Pick<AdminUser, "id" | "role" | "isActive" | "email" | "fullName">[]>(
      Prisma.sql`SELECT id, role, is_active AS "isActive", email, full_name AS "fullName" FROM admin_users WHERE id = ${params.id} FOR UPDATE`,
    );
    if (!target) throw new TeamMemberNotFoundError();

    const otherActiveOwners = await tx.adminUser.count({ where: { role: "owner", isActive: true, id: { not: target.id } } });
    validateTeamUpdate({ actor: params.actor, target, patch: params.patch, otherActiveOwners });

    const data = {
      ...(params.patch.role !== undefined ? { role: params.patch.role as AdminRole } : {}),
      ...(params.patch.isActive !== undefined ? { isActive: params.patch.isActive } : {}),
      ...(params.patch.fullName !== undefined ? { fullName: params.patch.fullName } : {}),
    };
    const updated = await tx.adminUser.update({ where: { id: target.id }, data, select: MEMBER_SELECT });

    await writeAuditInTx(tx, {
      actorType: "admin",
      actorId: params.actor.id,
      action: "team.update",
      entityType: "admin_user",
      entityId: target.id,
      before: { role: target.role, isActive: target.isActive, fullName: target.fullName },
      after: { role: updated.role, isActive: updated.isActive, fullName: updated.fullName },
      reason: params.reason ?? null,
    });
    return updated;
  });
}

/** دعوة عضو: تُنشئ حساب Supabase Auth عبر دعوة بريدية (Supabase يرسل الرابط بإعداداته
 * هو)، أو تربط حساب Auth موجودًا بنفس البريد. صف admin_users يُنشأ في الحالتين.
 * بلا SUPABASE_SERVICE_ROLE_KEY يرمي SupabaseConfigError (المسار يعرض «غير متاح»). */
export async function inviteTeamMember(params: {
  email: string;
  fullName: string | null;
  role: string;
  actor: AdminUser;
}): Promise<{ member: TeamMember; outcome: "invited" | "linked" }> {
  const email = params.email.trim().toLowerCase();
  validateTeamUpdate({
    actor: params.actor,
    target: { id: "", role: "viewer", isActive: true },
    patch: { role: params.role },
    otherActiveOwners: 1,
  });
  if (await prisma.adminUser.findUnique({ where: { email }, select: { id: true } })) throw new TeamMemberExistsError(email);

  const supabase = getSupabaseAdmin();
  let authUserId: string | undefined;
  let outcome: "invited" | "linked" = "invited";
  const invited = await supabase.auth.admin.inviteUserByEmail(email, { data: { full_name: params.fullName ?? undefined } });
  if (invited.data.user?.id) {
    authUserId = invited.data.user.id;
  } else {
    // مسجَّل مسبقًا في Auth (أو الدعوة رُفضت) — نربط الحساب القائم بدل الفشل.
    // ponytail: listUsers بلا فلتر بريد في SDK؛ مسح صفحة 1000 يكفي لفريق متجر واحد.
    const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) throw new Error(`Supabase Auth: ${error.message}`);
    const found = data.users.find((u) => u.email?.toLowerCase() === email);
    if (!found) throw new Error(`Supabase Auth: ${invited.error?.message ?? "تعذّر إنشاء الحساب"}`);
    authUserId = found.id;
    outcome = "linked";
  }

  const member = await prisma.$transaction(async (tx) => {
    const created = await tx.adminUser.create({
      data: { authUserId, email, fullName: params.fullName, role: params.role as AdminRole, isActive: true },
      select: MEMBER_SELECT,
    });
    await writeAuditInTx(tx, {
      actorType: "admin",
      actorId: params.actor.id,
      action: "team.invite",
      entityType: "admin_user",
      entityId: created.id,
      after: { email, role: created.role, outcome },
    });
    return created;
  });
  return { member, outcome };
}

// ---------- خريطة الصلاحيات ----------

export type RoleMatrix = {
  roles: readonly AdminRole[];
  catalog: readonly string[];
  granted: Record<string, string[]>;
};

export async function getRoleMatrix(): Promise<RoleMatrix> {
  const rows = await prisma.rolePermission.findMany({ where: { role: { in: [...CRM_ROLES] } }, select: { role: true, permission: true } });
  const granted: Record<string, string[]> = Object.fromEntries(CRM_ROLES.map((r) => [r, [] as string[]]));
  for (const r of rows) granted[r.role].push(r.permission);
  for (const r of CRM_ROLES) granted[r].sort();
  return { roles: CRM_ROLES, catalog: PERMISSION_CATALOG, granted };
}

/** منح/سحب صلاحية لدور — idempotent: الحالة النهائية هي المطلوبة مهما تكرر
 * الطلب أو تزامن (UNIQUE(role, permission) + P2002 يُعامل كنجاح). */
export async function setRolePermission(params: {
  role: string;
  permission: string;
  granted: boolean;
  actor: AdminUser;
  reason?: string | null;
}): Promise<{ changed: boolean }> {
  validateRolePermissionChange({ actorRole: params.actor.role, role: params.role, permission: params.permission });
  const role = params.role as AdminRole;

  return prisma.$transaction(async (tx) => {
    let changed = false;
    if (params.granted) {
      // ON CONFLICT DO NOTHING بدل create+catch(P2002): الخطأ داخل معاملة Postgres
      // يُجهض المعاملة كلها فلا يمكن المتابعة بعده.
      const inserted = await tx.$executeRaw(
        Prisma.sql`INSERT INTO role_permissions (id, role, permission, created_at)
          VALUES (gen_random_uuid()::text, ${role}::"AdminRole", ${params.permission}, now())
          ON CONFLICT (role, permission) DO NOTHING`,
      );
      changed = inserted > 0;
    } else {
      const res = await tx.rolePermission.deleteMany({ where: { role, permission: params.permission } });
      changed = res.count > 0;
    }
    if (changed) {
      await writeAuditInTx(tx, {
        actorType: "admin",
        actorId: params.actor.id,
        action: "rbac.update",
        entityType: "role_permission",
        entityId: `${role}:${params.permission}`,
        before: { granted: !params.granted },
        after: { granted: params.granted },
        reason: params.reason ?? null,
      });
    }
    return { changed };
  });
}
