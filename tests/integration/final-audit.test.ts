import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { updateOrderFields, updateOrderStatus, updateOrderDelivery } from "@/server/services/ordersService";
import { getAllCrmSettings } from "@/server/modules/settings/crmSettingsService";
import { createAdmin, createOrder, cleanupByTag, ensureWilayaCode, newTag, type FixtureTag } from "./support/customerFixtures";

// التدقيق النهائي — انحدارات: (1) تعديل هاتف الطلب يزامن phone_normalized ويوثَّق بفاعل
// حقيقي وهاتف مقنَّع؛ (2) تغيير الحالة من لوحة التحكم يُسجَّل باسم المشرف لا "system"؛
// (3) تغيير التوصيل يوثَّق بالمبالغ قبل/بعد؛ (4) الإعداد الميت attribution_window_days أُزيل.

const maybeDescribe = process.env.TEST_DATABASE_URL ? describe : describe.skip;

maybeDescribe("التدقيق النهائي — تدقيق الطلبات والفاعل (integration)", () => {
  let tag: FixtureTag;
  let adminId: string;
  let orderId: string;

  beforeAll(async () => {
    tag = newTag("fa");
    adminId = await createAdmin(tag);
    orderId = await createOrder(tag, { customerId: null, wilayaCode: await ensureWilayaCode(), totalDzd: 3000 });
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { entityId: orderId } });
    await cleanupByTag(tag);
  });

  it("تعديل الهاتف يُحدّث phone_normalized ويوثَّق بالمشرف مع قناع الهاتف", async () => {
    const updated = await updateOrderFields(orderId, { phone: "0661234567", notes: "ملاحظة" }, { type: "admin", id: adminId });
    expect(updated.phone).toBe("0661234567");
    expect(updated.phoneNormalized).toBe("0661234567");
    const audit = await prisma.auditLog.findFirst({ where: { action: "order.update", entityId: orderId }, orderBy: { createdAt: "desc" } });
    expect(audit?.actorType).toBe("admin");
    expect(audit?.actorId).toBe(adminId);
    const after = audit?.after as Record<string, unknown>;
    expect(after.notes).toBe("ملاحظة");
    expect(after.phone).not.toBe("0661234567"); // مقنَّع عند الكتابة
    expect(String(after.phone)).toMatch(/^06\*+67$/);
  });

  it("تغيير التوصيل يعيد حساب المبالغ من تسعيرة الولاية ويوثَّق قبل/بعد", async () => {
    const updated = await updateOrderDelivery(orderId, { deliveryOption: "home" }, { type: "admin", id: adminId });
    const audit = await prisma.auditLog.findFirst({ where: { action: "order.delivery_update", entityId: orderId } });
    expect(audit?.actorId).toBe(adminId);
    expect((audit?.after as { totalDzd: number }).totalDzd).toBe(updated.totalDzd);
    expect(Number.isInteger(updated.totalDzd)).toBe(true);
  });

  it("تغيير الحالة بفاعل مشرف يُسجَّل في سجل الحالات باسمه (لا system)", async () => {
    await updateOrderStatus(orderId, "confirmed", "تأكيد", { type: "admin", id: adminId });
    const history = await prisma.orderStatusHistory.findFirst({ where: { orderId, newStatus: "confirmed" }, orderBy: { createdAt: "desc" } });
    expect(history?.actorType).toBe("admin");
    expect(history?.actorId).toBe(adminId);
  });

  it("attribution_window_days لم يعد إعدادًا معلنًا", async () => {
    expect(Object.keys(await getAllCrmSettings())).not.toContain("attribution_window_days");
  });
});
