import { test, expect } from "./support/fixtures";
import { testPrisma } from "./support/testPrisma";

// تغطية RBAC على المسارات الإدارية — اختبار انحدار دائم.
//
// السبب: كتالوج الصلاحيات كان معلنًا بينما 43 مسارًا إداريًا يحمي نفسه بـ
// requireAdmin وحده (مصادقة بلا فحص دور)، فكان دور viewer يصل لتغيير حالات
// الطلبات وإنشاء المنتجات وقراءة مفاتيح API. أُثبت عمليًا قبل الإصلاح.
// هذا الاختبار يمنع عودة الفجوة: كل مسار هنا يجب أن يرفض دورًا لا يملك صلاحيته.

test.describe("تغطية RBAC للمسارات الإدارية @desktop-only", () => {
  test("دور بلا صلاحية يُرفض بـ403 على كل مسار محمي", async ({ staffPage }) => {
    const staffUser = await testPrisma.adminUser.findFirstOrThrow({
      where: { email: { contains: "e2e-staff" } },
      select: { id: true, role: true },
    });

    // packing_agent: يملك orders.read وproducts.read وinventory.read وtasks.* فقط
    await testPrisma.adminUser.update({
      where: { id: staffUser.id },
      data: { role: "packing_agent" },
    });

    const denied: Record<string, number> = {};
    const allowed: Record<string, number> = {};
    try {
      const r = staffPage.request;

      // كتابات يجب أن تُرفض (لا يملكها packing_agent)
      denied["POST /orders/bulk-status"] = (
        await r.post("/api/admin/orders/bulk-status", {
          data: { orderIds: ["00000000-0000-4000-8000-0000000000ff"], status: "confirmed" },
        })
      ).status();
      denied["POST /products"] = (await r.post("/api/admin/products", { data: {} })).status();
      denied["POST /sync-ads"] = (await r.post("/api/admin/sync-ads", { data: {} })).status();
      denied["GET /analytics"] = (await r.get("/api/admin/analytics")).status();
      denied["GET /master-dashboard"] = (await r.get("/api/admin/master-dashboard")).status();
      denied["GET /leads"] = (await r.get("/api/admin/leads")).status();
      denied["GET /site-settings"] = (await r.get("/api/admin/site-settings")).status();
      denied["GET /api-keys"] = (await r.get("/api/admin/api-keys")).status();
      denied["PATCH /orders/<id>"] = (
        await r.patch("/api/admin/orders/00000000-0000-4000-8000-0000000000ff", {
          data: { notes: "probe" },
        })
      ).status();

      // قراءات يملكها الدور فعلًا — يجب ألا تُرفض (الإصلاح لا يزيد التشديد بلا داعٍ)
      allowed["GET /orders"] = (await r.get("/api/admin/orders")).status();
      allowed["GET /products"] = (await r.get("/api/admin/products")).status();
    } finally {
      await testPrisma.adminUser.update({
        where: { id: staffUser.id },
        data: { role: staffUser.role },
      });
    }

    for (const [route, status] of Object.entries(denied)) {
      expect(status, `${route} يجب أن يُرفض لدور بلا صلاحيته`).toBe(403);
    }
    for (const [route, status] of Object.entries(allowed)) {
      expect(status, `${route} مسموح لهذا الدور ويجب ألا يُرفض`).toBe(200);
    }
  });

  test("بلا جلسة إطلاقًا: المسارات الإدارية تُرجع 401", async ({ page }) => {
    for (const path of ["/api/admin/orders", "/api/admin/products", "/api/admin/analytics"]) {
      const response = await page.request.get(path);
      expect(response.status(), path).toBe(401);
    }
  });
});
