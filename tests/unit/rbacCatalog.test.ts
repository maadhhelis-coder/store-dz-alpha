import { describe, it, expect } from "vitest";
import {
  PERMISSION_CATALOG,
  OWNER_ONLY_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  isKnownPermission,
} from "@/lib/rbac/permissions";

// ثابت 23/40/3.7: الكتالوج حتمي — الخريطة الافتراضية بالكود يجب أن تطابق الـseed
// فقاعدة البيانات حرفيًا (أي انحراف يفشل هذا الاختبار قبل النشر).

describe("كتالوج الصلاحيات", () => {
  it("لا تكرارات في الكتالوج", () => {
    expect(new Set(PERMISSION_CATALOG).size).toBe(PERMISSION_CATALOG.length);
  });

  it("كل صلاحية بصيغة resource.action", () => {
    for (const permission of PERMISSION_CATALOG) {
      expect(permission).toMatch(/^[a-z_]+\.[a-z_]+$/);
    }
  });

  it("isKnownPermission يتحقق بدقة", () => {
    expect(isKnownPermission("orders.read")).toBe(true);
    expect(isKnownPermission("orders.reads")).toBe(false);
    expect(isKnownPermission("")).toBe(false);
  });
});

describe("الخريطة الافتراضية للأدوار", () => {
  it("owner يملك الكتالوج كاملًا", () => {
    expect(DEFAULT_ROLE_PERMISSIONS.owner).toHaveLength(PERMISSION_CATALOG.length);
  });

  it("الصلاحيات المالكوية الخمس لا تُمنح لأي دور غير owner", () => {
    for (const [role, perms] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
      if (role === "owner") continue;
      for (const ownerOnly of OWNER_ONLY_PERMISSIONS) {
        expect(perms).not.toContain(ownerOnly);
      }
    }
  });

  it("deny-by-default: كل صلاحية ممنوحة موجودة في الكتالوج (لا صلاحيات مخترعة)", () => {
    for (const [, perms] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
      for (const permission of perms) {
        expect(PERMISSION_CATALOG).toContain(permission);
      }
    }
  });

  it("confirmation_agent يستطيع التأكيد والإسناد لكنه لا يدير المستخدمين", () => {
    const perms = DEFAULT_ROLE_PERMISSIONS.confirmation_agent;
    expect(perms).toContain("orders.confirm");
    expect(perms).toContain("orders.assign");
    expect(perms).not.toContain("users.manage");
    expect(perms).not.toContain("finance.adjust");
  });

  it("accountant يملك المالية والتدقيق لكنه لا يغيّر حالات الطلبات", () => {
    const perms = DEFAULT_ROLE_PERMISSIONS.accountant;
    expect(perms).toContain("finance.reconcile");
    expect(perms).toContain("audit.read");
    expect(perms).not.toContain("orders.status_change");
    expect(perms).not.toContain("orders.confirm");
  });

  it("viewer قراءة فقط — لا أي إجراء كتابة", () => {
    const writePermissions = PERMISSION_CATALOG.filter(
      (p) =>
        p.endsWith(".update") ||
        p.endsWith(".manage") ||
        p.endsWith(".create") ||
        p.endsWith(".cancel") ||
        p.endsWith(".confirm") ||
        p.endsWith(".assign") ||
        p.endsWith(".merge") ||
        p.endsWith(".adjust") ||
        p.endsWith(".reconcile") ||
        p.endsWith(".send") ||
        p.endsWith(".blacklist") ||
        p.endsWith(".anonymize"),
    );
    for (const writePermission of writePermissions) {
      expect(DEFAULT_ROLE_PERMISSIONS.viewer).not.toContain(writePermission);
    }
  });

  it("logistics_agent يدير الشحنات والإرجاعات لكنه لا يمس المالية", () => {
    const perms = DEFAULT_ROLE_PERMISSIONS.logistics_agent;
    expect(perms).toContain("shipments.create");
    expect(perms).toContain("returns.manage");
    expect(perms).not.toContain("finance.adjust");
  });
});

// P4: صلاحيتان جديدتان — الكتالوج والـseed migration يجب أن يتطابقا حرفيًا،
// وإلا فالتفويض يفشل بـ403 في الإنتاج بينما الكود يظن أن الصلاحية ممنوحة.
describe("صلاحيات P4 (risk.read / fraud.review)", () => {
  const P4_PERMISSIONS = ["risk.read", "fraud.review"] as const;

  it("الصلاحيتان في الكتالوج", () => {
    for (const permission of P4_PERMISSIONS) {
      expect(PERMISSION_CATALOG).toContain(permission);
      expect(isKnownPermission(permission)).toBe(true);
    }
  });

  it("ليستا ضمن الصلاحيات المالكوية (تشغيليتان لا إداريتان)", () => {
    for (const permission of P4_PERMISSIONS) {
      expect(OWNER_ONLY_PERMISSIONS).not.toContain(permission);
    }
  });

  it("deny-by-default: الأدوار التي لا تحتاجهما لا تملكهما", () => {
    expect(DEFAULT_ROLE_PERMISSIONS.packing_agent).not.toContain("risk.read");
    expect(DEFAULT_ROLE_PERMISSIONS.marketing).not.toContain("risk.read");
    // مراجعة الاحتيال قرار بشري محصور — لا يملكه القارئ ولا وكيل التأكيد
    expect(DEFAULT_ROLE_PERMISSIONS.viewer).not.toContain("fraud.review");
    expect(DEFAULT_ROLE_PERMISSIONS.confirmation_agent).not.toContain("fraud.review");
    expect(DEFAULT_ROLE_PERMISSIONS.accountant).not.toContain("fraud.review");
  });

  it("الأدوار المخوَّلة تملكهما فعلًا", () => {
    expect(DEFAULT_ROLE_PERMISSIONS.owner).toContain("risk.read");
    expect(DEFAULT_ROLE_PERMISSIONS.owner).toContain("fraud.review");
    expect(DEFAULT_ROLE_PERMISSIONS.admin).toContain("fraud.review");
    expect(DEFAULT_ROLE_PERMISSIONS.customer_support).toContain("fraud.review");
    expect(DEFAULT_ROLE_PERMISSIONS.viewer).toContain("risk.read");
  });

  it("الـseed migration يزرع نفس التوزيع المُعلن في الكود (تطابق حرفي)", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const dir = readdirSync("prisma/migrations").find((d) => d.includes("p4_risk_fraud_permissions"));
    expect(dir, "migration الصلاحيات مفقودة").toBeDefined();
    const sql = readFileSync(`prisma/migrations/${dir}/migration.sql`, "utf8");

    for (const permission of P4_PERMISSIONS) {
      expect(sql).toContain(`'${permission}'`);
    }
    // كل دور يملك صلاحية في الكود يجب أن يُذكر في الـmigration
    for (const [role, perms] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
      for (const permission of P4_PERMISSIONS) {
        if (perms.includes(permission)) {
          expect(sql, `${role} يملك ${permission} في الكود لكن ليس في الـmigration`).toContain(`'${role}'`);
        }
      }
    }
  });
});
