import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import type { AdminUser } from "@prisma/client";
import { updateTeamMember, setRolePermission, getRoleMatrix, TeamRuleError, listTeamMembers } from "@/server/modules/team/teamService";
import { buildExport, ExportTooLargeError } from "@/server/modules/exports/exportsService";
import { getSystemStatus } from "@/server/modules/observability/systemStatusService";
import { createOrder, cleanupByTag, ensureWilayaCode, newTag, type FixtureTag } from "./support/customerFixtures";

// P8 — إدارة الفريق (قفل الصف + audit في المعاملة)، تبديل الصلاحيات المتزامن
// (idempotent على UNIQUE(role, permission))، التصدير المحدود (413 بدل اقتطاع، قناع
// الهاتف حسب customers.read)، وتجميع حالة النظام.

const maybeDescribe = process.env.TEST_DATABASE_URL ? describe : describe.skip;

async function mkAdmin(tag: FixtureTag, role: AdminUser["role"], suffix: string): Promise<AdminUser> {
  return prisma.adminUser.create({
    data: { authUserId: `auth-${tag}-${suffix}`, email: `${tag}-${suffix}@test.invalid`, fullName: `أدمن ${tag}`, role },
  });
}

maybeDescribe("P8 — الفريق والصلاحيات والتصدير (integration)", () => {
  let tag: FixtureTag;
  let owner: AdminUser;
  let owner2: AdminUser;
  let viewer: AdminUser;
  let marketing: AdminUser;
  const PERM = "audit.read";
  const ROLE = "marketing" as const;

  beforeAll(async () => {
    tag = newTag("p8");
    [owner, owner2, viewer, marketing] = await Promise.all([mkAdmin(tag, "owner", "o1"), mkAdmin(tag, "owner", "o2"), mkAdmin(tag, "viewer", "v"), mkAdmin(tag, "marketing", "m")]);
    await prisma.rolePermission.deleteMany({ where: { role: ROLE, permission: PERM } });
  });

  afterAll(async () => {
    await prisma.rolePermission.deleteMany({ where: { role: ROLE, permission: PERM } });
    await prisma.auditLog.deleteMany({ where: { OR: [{ actorId: { in: [owner.id, owner2.id, viewer.id, marketing.id] } }, { entityId: { in: [viewer.id, owner2.id] } }] } });
    await cleanupByTag(tag);
    await prisma.adminUser.deleteMany({ where: { email: { contains: tag } } });
  });

  it("تغيير الدور يُحفظ ويُوثَّق قبل/بعد في نفس المعاملة", async () => {
    const updated = await updateTeamMember({ id: viewer.id, actor: owner, patch: { role: "accountant" }, reason: "اختبار" });
    expect(updated.role).toBe("accountant");
    const audit = await prisma.auditLog.findFirst({ where: { action: "team.update", entityId: viewer.id }, orderBy: { createdAt: "desc" } });
    expect(audit?.before).toMatchObject({ role: "viewer" });
    expect(audit?.after).toMatchObject({ role: "accountant" });
    expect((await listTeamMembers({ q: tag, role: "accountant" })).map((m) => m.id)).toEqual([viewer.id]);
  });

  it("الذات مرفوضة، والدور القديم مرفوض، وغير المالك لا يمسّ مالكًا", async () => {
    await expect(updateTeamMember({ id: owner.id, actor: owner, patch: { isActive: false } })).rejects.toMatchObject({ code: "SELF_MODIFY" });
    await expect(updateTeamMember({ id: viewer.id, actor: owner, patch: { role: "staff" } })).rejects.toBeInstanceOf(TeamRuleError);
    await expect(updateTeamMember({ id: owner2.id, actor: viewer, patch: { isActive: false } })).rejects.toMatchObject({ code: "OWNER_TARGET" });
    // لم يُكتب أي audit لمحاولات مرفوضة
    expect(await prisma.auditLog.count({ where: { action: "team.update", entityId: owner2.id } })).toBe(0);
  });

  it("تعطيل مالك مع بقاء مالك نشط آخر مسموح", async () => {
    const r = await updateTeamMember({ id: owner2.id, actor: owner, patch: { isActive: false } });
    expect(r.isActive).toBe(false);
  });

  it("تبديل صلاحية متزامن ×5 = صف واحد وaudit واحد؛ التكرار لا يغيّر شيئًا", async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => setRolePermission({ role: ROLE, permission: PERM, granted: true, actor: owner })));
    expect(results.filter((r) => r.changed)).toHaveLength(1);
    expect(await prisma.rolePermission.count({ where: { role: ROLE, permission: PERM } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "rbac.update", entityId: `${ROLE}:${PERM}` } })).toBe(1);
    expect((await getRoleMatrix()).granted[ROLE]).toContain(PERM);

    const revoke = await setRolePermission({ role: ROLE, permission: PERM, granted: false, actor: owner });
    expect(revoke.changed).toBe(true);
    expect((await setRolePermission({ role: ROLE, permission: PERM, granted: false, actor: owner })).changed).toBe(false);
    expect((await getRoleMatrix()).granted[ROLE]).not.toContain(PERM);
  });

  it("قواعد RBAC على الخدمة: المالك مقفل، الحصرية ممنوعة، الدور الذاتي ممنوع", async () => {
    await expect(setRolePermission({ role: "owner", permission: "orders.read", granted: false, actor: owner })).rejects.toMatchObject({ code: "OWNER_ROLE_LOCKED" });
    await expect(setRolePermission({ role: "admin", permission: "users.manage", granted: true, actor: owner })).rejects.toMatchObject({ code: "OWNER_ONLY_PERMISSION" });
    await expect(setRolePermission({ role: "marketing", permission: "orders.read", granted: true, actor: marketing })).rejects.toMatchObject({ code: "SELF_ROLE" });
  });

  it("التصدير: تجاوز الحد = خطأ صريح؛ ضمن الحد = CSV بالطلبات غير الاختبارية؛ الهاتف مقنَّع بلا customers.read", async () => {
    const wilaya = await ensureWilayaCode();
    await createOrder(tag, { customerId: null, wilayaCode: wilaya, totalDzd: 2500 });
    await createOrder(tag, { customerId: null, wilayaCode: wilaya, totalDzd: 3000 });
    await createOrder(tag, { customerId: null, wilayaCode: wilaya, totalDzd: 9999, isTest: true });

    await expect(buildExport({ entity: "orders", filters: {}, actor: owner, maxRows: 1 })).rejects.toBeInstanceOf(ExportTooLargeError);

    const full = await buildExport({ entity: "orders", filters: {}, actor: owner, maxRows: 100_000 });
    const mine = full.csv.split("\r\n").filter((l) => l.includes(`IT-${tag}`));
    expect(mine).toHaveLength(2); // isTest مستبعد
    expect(mine[0]).toContain(",0550000000,");
    expect(mine[0]).toContain(",2500,");
    expect(full.csv.startsWith("﻿")).toBe(true);

    const masked = await buildExport({ entity: "orders", filters: {}, actor: marketing, maxRows: 100_000 });
    const line = masked.csv.split("\r\n").find((l) => l.includes(`IT-${tag}`))!;
    expect(line).not.toContain("0550000000");
    expect(line).toContain("05*******00");

    const audit = await prisma.auditLog.findFirst({ where: { action: "export", actorId: marketing.id }, orderBy: { createdAt: "desc" } });
    expect(audit?.after).toMatchObject({ fullPhone: false });
  });

  it("حالة النظام تُجمَّع بلا أخطاء وتعكس الهجرات المطبّقة", async () => {
    const s = await getSystemStatus();
    expect(s.errors).toEqual([]);
    expect(s.db.ok).toBe(true);
    expect(s.migrations.applied).toBeGreaterThan(30);
    expect(s.migrations.failed).toBe(0);
    expect(typeof s.outbox.pending).toBe("number");
    expect(Array.isArray(s.jobs)).toBe(true);
  });
});
