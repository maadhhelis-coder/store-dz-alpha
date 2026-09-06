import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { cleanupOldTrackingData } from "@/server/services/dataRetentionService";
import { listAuditLogs, writeAudit } from "@/server/services/auditService";
import { createAdmin, cleanupByTag, newTag, type FixtureTag } from "./support/customerFixtures";

// بندان من تدقيق P1/P2 خارج القائمة الخمسة:
// 1) cleanupExpiredIdempotencyKeys كانت بلا أي مستدعٍ ⇒ الجدول ينمو بلا حد.
// 2) listAuditLogs كانت بلا أي مستدعٍ، وترتيبها بلا فاصل تعادل بالـid ⇒ ترقيم
//    غير حتمي عند تساوي الطابع الزمني (تكرار صف واختفاء آخر بين الصفحات).

const maybeDescribe = process.env.TEST_DATABASE_URL ? describe : describe.skip;

maybeDescribe("الاحتفاظ والسجل التدقيقي (integration)", () => {
  let tag: FixtureTag;
  let adminId: string;

  beforeAll(async () => {
    tag = newTag("ret");
    adminId = await createAdmin(tag);
  });

  afterAll(async () => {
    await prisma.idempotencyKey.deleteMany({ where: { operation: { contains: tag } } });
    await prisma.auditLog.deleteMany({ where: { entityType: `probe-${tag}` } });
    await cleanupByTag(tag);
  });

  it("التنظيف يحذف مفاتيح idempotency المنتهية ويترك السارية", async () => {
    const base = {
      actorId: adminId,
      operation: `op-${tag}`,
      requestHash: "hash",
      status: "completed",
    };
    await prisma.idempotencyKey.create({
      data: { ...base, idempotencyKey: `expired-${tag}`, expiresAt: new Date(Date.now() - 60_000) },
    });
    await prisma.idempotencyKey.create({
      data: { ...base, idempotencyKey: `live-${tag}`, expiresAt: new Date(Date.now() + 3_600_000) },
    });

    const result = await cleanupOldTrackingData();
    expect(result.deletedExpiredIdempotencyKeys).toBeGreaterThanOrEqual(1);

    const remaining = await prisma.idempotencyKey.findMany({
      where: { operation: `op-${tag}` },
      select: { idempotencyKey: true },
    });
    expect(remaining.map((r) => r.idempotencyKey)).toEqual([`live-${tag}`]);
  });

  it("ترقيم السجل التدقيقي حتمي عند تساوي الطابع الزمني", async () => {
    const entityType = `probe-${tag}`;
    const sameMoment = new Date("2026-02-02T10:00:00.000Z");
    for (let i = 0; i < 6; i++) {
      await writeAudit({
        actorType: "system",
        action: "probe",
        entityType,
        entityId: `e-${i}`,
        after: { i },
      });
    }
    // نساوي الطوابع عمدًا — هنا بالضبط كان الترتيب يتذبذب بلا فاصل id
    await prisma.auditLog.updateMany({ where: { entityType }, data: { createdAt: sameMoment } });

    const p1 = await listAuditLogs({ entityType, page: 1, pageSize: 3 });
    const p2 = await listAuditLogs({ entityType, page: 2, pageSize: 3 });
    const ids = [...p1.items, ...p2.items].map((a) => a.id);

    expect(p1.total).toBe(6);
    expect(new Set(ids).size).toBe(6); // لا تكرار ولا فقدان عبر الصفحات

    // نفس الاستعلام مرتين ⇒ نفس الترتيب بالضبط
    const again = await listAuditLogs({ entityType, page: 1, pageSize: 3 });
    expect(again.items.map((a) => a.id)).toEqual(p1.items.map((a) => a.id));
  });

  it("الفلترة بالإجراء والكيان تعمل", async () => {
    const entityType = `probe-${tag}`;
    const filtered = await listAuditLogs({ entityType, action: "probe", page: 1, pageSize: 50 });
    expect(filtered.items.length).toBeGreaterThan(0);
    expect(filtered.items.every((a) => a.action === "probe" && a.entityType === entityType)).toBe(true);

    const none = await listAuditLogs({ entityType, action: "no_such_action", page: 1, pageSize: 50 });
    expect(none.total).toBe(0);
  });
});
