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
