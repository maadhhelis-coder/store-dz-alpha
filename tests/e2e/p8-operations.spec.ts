import { test, expect } from "./support/fixtures";
import { testPrisma } from "./support/testPrisma";
import { E2E_OWNER_EMAIL } from "./support/adminFixtures";

// P8 من طرف إلى طرف: الفريق والصلاحيات (users.read/users.manage + قواعد الخادم +
// audit)، التصدير (exports.create + صلاحية الكيان، CSV حقيقي، 413 صريح)، حالة
// النظام (settings.read)، سجل التدقيق بفلاتره، وRBAC (401/403/قراءة فقط).

test.describe("P8 — الفريق والتصدير وحالة النظام @desktop-only", () => {
  test("المالك: صفحة الفريق، تغيير دور الموظف عبر الواجهة يُوثَّق، المصفوفة تبديل idempotent، الذات مرفوضة", async ({ ownerPage }) => {
    const staff = await testPrisma.adminUser.findFirstOrThrow({ where: { email: { contains: "e2e-staff" } }, select: { id: true, role: true } });
    const owner = await testPrisma.adminUser.findUniqueOrThrow({ where: { email: E2E_OWNER_EMAIL }, select: { id: true } });
    const r = ownerPage.request;
    try {
      await ownerPage.goto("/admin/team");
      await expect(ownerPage.getByTestId("team-table")).toBeVisible();
      await expect(ownerPage.getByTestId("role-matrix")).toBeVisible();
      await expect(ownerPage.getByTestId("invite-open")).toBeVisible();

      // تغيير دور الموظف من الواجهة
      await ownerPage.getByTestId("team-role-" + staff.id).selectOption("accountant");
      await expect.poll(async () => (await testPrisma.adminUser.findUniqueOrThrow({ where: { id: staff.id } })).role).toBe("accountant");
      const audit = await testPrisma.auditLog.findFirst({ where: { action: "team.update", entityId: staff.id, actorId: owner.id }, orderBy: { createdAt: "desc" } });
      expect(audit?.after).toMatchObject({ role: "accountant" });

      // الذات: 409 على الخادم حتى لو زُوِّر الطلب
      expect((await r.patch("/api/admin/crm/team/" + owner.id, { data: { isActive: false } })).status()).toBe(409);
      // الدور القديم staff غير قابل للإسناد (zod) — 400
      expect((await r.patch("/api/admin/crm/team/" + staff.id, { data: { role: "staff" } })).status()).toBe(400);

      // المصفوفة: منح audit.read لـmarketing مرتين = تغيير واحد؛ ثم سحب
      const g1 = await r.patch("/api/admin/crm/team/permissions", { data: { role: "marketing", permission: "audit.read", granted: true } });
      expect(g1.status()).toBe(200);
      expect((await g1.json()).changed).toBe(true);
      const g2 = await r.patch("/api/admin/crm/team/permissions", { data: { role: "marketing", permission: "audit.read", granted: true } });
      expect((await g2.json()).changed).toBe(false);
      expect((await r.patch("/api/admin/crm/team/permissions", { data: { role: "owner", permission: "audit.read", granted: false } })).status()).toBe(409);
      expect((await r.patch("/api/admin/crm/team/permissions", { data: { role: "admin", permission: "users.manage", granted: true } })).status()).toBe(409);
      const rev = await r.patch("/api/admin/crm/team/permissions", { data: { role: "marketing", permission: "audit.read", granted: false } });
      expect((await rev.json()).changed).toBe(true);
      expect(await testPrisma.auditLog.count({ where: { action: "rbac.update", entityId: "marketing:audit.read", actorId: owner.id } })).toBe(2);

      // دعوة ببريد عضو موجود = 409 صريح (لا نداء Supabase)
      expect((await r.post("/api/admin/crm/team", { data: { email: E2E_OWNER_EMAIL, role: "viewer" } })).status()).toBe(409);
    } finally {
      await testPrisma.rolePermission.deleteMany({ where: { role: "marketing", permission: "audit.read" } });
      await testPrisma.adminUser.update({ where: { id: staff.id }, data: { role: staff.role, isActive: true } });
    }
  });

  test("التصدير: CSV حقيقي للمالك، الحد يُرفض صراحة، وسجل التدقيق يعرض الفلاتر والتصدير", async ({ ownerPage }) => {
    const r = ownerPage.request;
    const csv = await r.get("/api/admin/crm/exports?entity=orders&status=delivered");
    expect(csv.status()).toBe(200);
    expect(csv.headers()["content-type"]).toContain("text/csv");
    expect(csv.headers()["content-disposition"]).toContain("storedz-orders-");
    const body = await csv.text();
    expect(body.startsWith("﻿order_number,status,")).toBe(true);
    expect(Number(csv.headers()["x-export-rows"])).toBe(body.trim().split("\r\n").length - 1);

    expect((await r.get("/api/admin/crm/exports?entity=nope")).status()).toBe(400);

    // الحد الأدنى المسموح للإعداد 100 — نضبطه ونتحقق أن تجاوزه على سجل التدقيق (كبير فعليًا) يعطي 413 لا ملفًا مقتطعًا
    const before = await testPrisma.crmSetting.findUnique({ where: { key: "export_max_rows" } });
    try {
      await testPrisma.crmSetting.upsert({ where: { key: "export_max_rows" }, create: { key: "export_max_rows", value: 100 }, update: { value: 100 } });
      const total = await testPrisma.auditLog.count();
      const res = await r.get("/api/admin/crm/exports?entity=audit");
      if (total > 100) {
        expect(res.status()).toBe(413);
        expect((await res.json()).code).toBe("TOO_LARGE");
      } else {
        expect(res.status()).toBe(200);
      }
    } finally {
      if (before) await testPrisma.crmSetting.update({ where: { key: "export_max_rows" }, data: { value: before.value as object } });
      else await testPrisma.crmSetting.deleteMany({ where: { key: "export_max_rows" } });
    }

    await ownerPage.goto("/admin/audit?action=export");
    await expect(ownerPage.getByTestId("audit-filters")).toBeVisible();
    await expect(ownerPage.getByTestId("audit-table")).toContainText("export");
    await expect(ownerPage.getByTestId("audit-export")).toBeVisible();
  });

  test("حالة النظام: الصفحة والـAPI للمالك؛ /api/health العام لا يكشف تفاصيل", async ({ ownerPage, page }) => {
    await ownerPage.goto("/admin/system");
    for (const id of ["card-db", "card-migrations", "card-outbox", "card-comms", "card-sheets", "card-jobs", "exports-panel"]) {
      await expect(ownerPage.getByTestId(id)).toBeVisible();
    }
    await expect(ownerPage.getByTestId("card-db")).toContainText("متصلة");
    const s = await (await ownerPage.request.get("/api/admin/crm/system-status")).json();
    expect(s.db.ok).toBe(true);
    expect(s.migrations.failed).toBe(0);
    expect(s.errors).toEqual([]);

    const pub = await (await page.request.get("/api/health")).json();
    expect(Object.keys(pub)).toEqual(["status"]);
    expect((await page.request.get("/api/admin/crm/system-status")).status()).toBe(401);
  });

  test("RBAC: بلا جلسة 401؛ packing_agent 403 على الفريق/التصدير/الحالة؛ viewer يقرأ ولا يعدّل ولا يصدّر", async ({ page, staffPage }) => {
    expect((await page.request.get("/api/admin/crm/team")).status()).toBe(401);
    expect((await page.request.get("/api/admin/crm/exports?entity=orders")).status()).toBe(401);
    const staff = await testPrisma.adminUser.findFirstOrThrow({ where: { email: { contains: "e2e-staff" } }, select: { id: true, role: true } });
    const r = staffPage.request;
    try {
      await testPrisma.adminUser.update({ where: { id: staff.id }, data: { role: "packing_agent" } });
      expect((await r.get("/api/admin/crm/team")).status()).toBe(403);
      expect((await r.get("/api/admin/crm/team/permissions")).status()).toBe(403);
      expect((await r.get("/api/admin/crm/exports?entity=orders")).status()).toBe(403);
      expect((await r.get("/api/admin/crm/system-status")).status()).toBe(403);

      await testPrisma.adminUser.update({ where: { id: staff.id }, data: { role: "viewer" } });
      expect((await r.get("/api/admin/crm/team")).status()).toBe(200);
      expect((await r.get("/api/admin/crm/team/permissions")).status()).toBe(200);
      expect((await r.get("/api/admin/crm/system-status")).status()).toBe(200);
      expect((await r.patch("/api/admin/crm/team/" + staff.id, { data: { fullName: "x" } })).status()).toBe(403);
      expect((await r.patch("/api/admin/crm/team/permissions", { data: { role: "marketing", permission: "audit.read", granted: true } })).status()).toBe(403);
      expect((await r.post("/api/admin/crm/team", { data: { email: "x@test.invalid", role: "viewer" } })).status()).toBe(403);
      // viewer يملك orders.read لكن لا exports.create → 403
      expect((await r.get("/api/admin/crm/exports?entity=orders")).status()).toBe(403);

      await staffPage.goto("/admin/team");
      await expect(staffPage.getByTestId("team-table")).toBeVisible();
      await expect(staffPage.getByTestId("invite-open")).toHaveCount(0);
      await expect(staffPage.getByTestId("team-role-" + staff.id)).toHaveCount(0);

      // marketing: exports.create + orders.read → CSV بهاتف مقنَّع (لا customers.read)
      await testPrisma.adminUser.update({ where: { id: staff.id }, data: { role: "marketing" } });
      const csv = await r.get("/api/admin/crm/exports?entity=orders");
      expect(csv.status()).toBe(200);
      expect((await csv.text()).match(/\b0[5-7]\d{8}\b/)).toBeNull();
      expect((await r.get("/api/admin/crm/exports?entity=customers")).status()).toBe(403);
    } finally {
      await testPrisma.adminUser.update({ where: { id: staff.id }, data: { role: staff.role } });
    }
  });
});
