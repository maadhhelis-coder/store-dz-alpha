import { describe, expect, it } from "vitest";
import { validateTeamUpdate, validateRolePermissionChange, TeamRuleError, isAssignableRole } from "@/lib/rbac/teamRules";
import { csvCell, toCsv } from "@/lib/csv";
import { EXPORT_ENTITIES } from "@/server/modules/exports/exportsService";
import { PERMISSION_CATALOG, OWNER_ONLY_PERMISSIONS } from "@/lib/rbac/permissions";

// P8 — قواعد الفريق/RBAC الصرفة وCSV التصدير وخريطة صلاحيات التصدير — بلا قاعدة بيانات.

const owner = { id: "o1", role: "owner" as const };
const admin = { id: "a1", role: "admin" as const };
const code = (fn: () => void) => {
  try {
    fn();
    return null;
  } catch (e) {
    return e instanceof TeamRuleError ? e.code : "OTHER";
  }
};

describe("validateTeamUpdate", () => {
  it("لا يعدّل أحد دوره أو حالته بنفسه", () => {
    expect(code(() => validateTeamUpdate({ actor: owner, target: { id: "o1", role: "owner", isActive: true }, patch: { isActive: false }, otherActiveOwners: 3 }))).toBe("SELF_MODIFY");
    // تغيير الاسم للذات مسموح
    expect(code(() => validateTeamUpdate({ actor: owner, target: { id: "o1", role: "owner", isActive: true }, patch: {}, otherActiveOwners: 0 }))).toBeNull();
  });

  it("الدور القديم staff غير قابل للإسناد", () => {
    expect(isAssignableRole("staff")).toBe(false);
    expect(code(() => validateTeamUpdate({ actor: owner, target: { id: "x", role: "viewer", isActive: true }, patch: { role: "staff" }, otherActiveOwners: 1 }))).toBe("LEGACY_ROLE");
  });

  it("غير المالك لا يمسّ مالكًا ولا يمنح دور المالك", () => {
    expect(code(() => validateTeamUpdate({ actor: admin, target: { id: "x", role: "owner", isActive: true }, patch: { isActive: false }, otherActiveOwners: 2 }))).toBe("OWNER_TARGET");
    expect(code(() => validateTeamUpdate({ actor: admin, target: { id: "x", role: "viewer", isActive: true }, patch: { role: "owner" }, otherActiveOwners: 2 }))).toBe("OWNER_TARGET");
  });

  it("آخر مالك نشط لا يُعطَّل ولا يُخفَّض؛ ومع مالك آخر يُسمح", () => {
    const t = { id: "x", role: "owner" as const, isActive: true };
    expect(code(() => validateTeamUpdate({ actor: owner, target: t, patch: { isActive: false }, otherActiveOwners: 0 }))).toBe("LAST_OWNER");
    expect(code(() => validateTeamUpdate({ actor: owner, target: t, patch: { role: "admin" }, otherActiveOwners: 0 }))).toBe("LAST_OWNER");
    expect(code(() => validateTeamUpdate({ actor: owner, target: t, patch: { role: "admin" }, otherActiveOwners: 1 }))).toBeNull();
    // مالك معطّل أصلًا لا يُحتسب فقدانه
    expect(code(() => validateTeamUpdate({ actor: owner, target: { ...t, isActive: false }, patch: { role: "viewer" }, otherActiveOwners: 0 }))).toBeNull();
  });
});

describe("validateRolePermissionChange", () => {
  it("خريطة المالك مقفلة، الصلاحيات الحصرية لا تُمنح، ولا أحد يعدّل دوره", () => {
    expect(code(() => validateRolePermissionChange({ actorRole: "owner", role: "owner", permission: "orders.read" }))).toBe("OWNER_ROLE_LOCKED");
    for (const p of OWNER_ONLY_PERMISSIONS) {
      expect(code(() => validateRolePermissionChange({ actorRole: "owner", role: "admin", permission: p }))).toBe("OWNER_ONLY_PERMISSION");
    }
    expect(code(() => validateRolePermissionChange({ actorRole: "admin", role: "admin", permission: "orders.read" }))).toBe("SELF_ROLE");
    expect(code(() => validateRolePermissionChange({ actorRole: "owner", role: "staff", permission: "orders.read" }))).toBe("LEGACY_ROLE");
    expect(code(() => validateRolePermissionChange({ actorRole: "owner", role: "viewer", permission: "nope.x" }))).toBe("UNKNOWN_PERMISSION");
    expect(code(() => validateRolePermissionChange({ actorRole: "owner", role: "viewer", permission: "exports.create" }))).toBeNull();
  });
});

describe("CSV", () => {
  it("BOM + CRLF، اقتباس، تواريخ ISO، أعداد كما هي، حماية من حقن الصيغ", () => {
    const csv = toCsv(["a", "b"], [["x,y", 1500], [new Date("2026-09-18T10:00:00Z"), null], ['say "hi"', "=cmd()"]]);
    expect(csv.startsWith("﻿a,b\r\n")).toBe(true);
    expect(csv).toContain('"x,y",1500\r\n');
    expect(csv).toContain("2026-09-18T10:00:00.000Z,\r\n");
    expect(csv).toContain('"say ""hi""",\'=cmd()');
    expect(csvCell(true)).toBe("true");
  });
});

describe("خريطة صلاحيات التصدير", () => {
  it("كل كيان يتطلب صلاحية قراءة معروفة في الكتالوج", () => {
    for (const p of Object.values(EXPORT_ENTITIES)) expect(PERMISSION_CATALOG).toContain(p);
  });
});
