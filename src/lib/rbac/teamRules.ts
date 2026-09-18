import type { AdminRole } from "@prisma/client";
import { CRM_ROLES, OWNER_ONLY_PERMISSIONS, isKnownPermission, type CrmRole } from "@/lib/rbac/permissions";

// قواعد إدارة الفريق وRBAC (P8) — دوال صرفة بلا قاعدة بيانات كي تُختبر وحدةً.
// التفويض نفسه (users.manage) يبقى على المسار عبر requirePermission؛ هذه القواعد
// تمنع ما لا يمنعه الكتالوج: تعديل الذات، قفل آخر مالك، الدور القديم staff،
// ومنح صلاحيات المالك لغيره أو تعديل خريطة المالك أو خريطة دور الفاعل نفسه.

export class TeamRuleError extends Error {
  constructor(
    public readonly code:
      | "SELF_MODIFY"
      | "LAST_OWNER"
      | "LEGACY_ROLE"
      | "OWNER_TARGET"
      | "UNKNOWN_PERMISSION"
      | "OWNER_ROLE_LOCKED"
      | "OWNER_ONLY_PERMISSION"
      | "SELF_ROLE",
    message: string,
  ) {
    super(message);
    this.name = "TeamRuleError";
  }
}

export function isAssignableRole(role: string): role is CrmRole {
  return (CRM_ROLES as readonly string[]).includes(role);
}

/** التحقق من تعديل عضو: الفاعل (دوره ومعرّفه)، الهدف الحالي، التغيير المطلوب،
 * وعدد المالكين النشطين الآخرين (بلا الهدف). */
export function validateTeamUpdate(params: {
  actor: { id: string; role: AdminRole };
  target: { id: string; role: AdminRole; isActive: boolean };
  patch: { role?: string; isActive?: boolean };
  otherActiveOwners: number;
}): void {
  const { actor, target, patch } = params;
  if (actor.id === target.id && (patch.role !== undefined || patch.isActive !== undefined)) {
    throw new TeamRuleError("SELF_MODIFY", "لا يمكنك تغيير دورك أو تعطيل حسابك بنفسك");
  }
  if (patch.role !== undefined && !isAssignableRole(patch.role)) {
    throw new TeamRuleError("LEGACY_ROLE", `دور غير قابل للإسناد: ${patch.role}`);
  }
  // المالك وحده يمسّ حسابات المالكين أو يمنح دور المالك — لا يُستنتج من users.manage
  if (actor.role !== "owner" && (target.role === "owner" || patch.role === "owner")) {
    throw new TeamRuleError("OWNER_TARGET", "تعديل حسابات المالكين أو منح دور المالك متاح للمالك فقط");
  }
  const losesOwner =
    target.role === "owner" &&
    target.isActive &&
    ((patch.role !== undefined && patch.role !== "owner") || patch.isActive === false);
  if (losesOwner && params.otherActiveOwners === 0) {
    throw new TeamRuleError("LAST_OWNER", "لا يمكن تعطيل أو تخفيض آخر مالك نشط");
  }
}

/** التحقق من تبديل (دور، صلاحية) في role_permissions. */
export function validateRolePermissionChange(params: {
  actorRole: AdminRole;
  role: string;
  permission: string;
}): asserts params is { actorRole: AdminRole; role: CrmRole; permission: string } {
  if (!isAssignableRole(params.role)) {
    throw new TeamRuleError("LEGACY_ROLE", `دور غير معروف: ${params.role}`);
  }
  if (!isKnownPermission(params.permission)) {
    throw new TeamRuleError("UNKNOWN_PERMISSION", `صلاحية غير معروفة: ${params.permission}`);
  }
  // خريطة المالك = الكتالوج كاملًا دائمًا (منع القفل الذاتي للنظام)
  if (params.role === "owner") {
    throw new TeamRuleError("OWNER_ROLE_LOCKED", "صلاحيات المالك ثابتة ولا تُعدَّل");
  }
  if ((OWNER_ONLY_PERMISSIONS as readonly string[]).includes(params.permission)) {
    throw new TeamRuleError("OWNER_ONLY_PERMISSION", "هذه الصلاحية حصرية للمالك ولا تُمنح لدور آخر");
  }
  // لا يعدّل أحد خريطة دوره هو (منع منح الذات)
  if (params.role === params.actorRole) {
    throw new TeamRuleError("SELF_ROLE", "لا يمكنك تعديل صلاحيات دورك أنت");
  }
}
