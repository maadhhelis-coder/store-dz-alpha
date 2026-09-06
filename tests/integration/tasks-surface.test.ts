import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import {
  createTask,
  completeTask,
  listTasks,
  tasksOverdueCount,
  TaskNotFoundError,
} from "@/server/modules/tasks/tasksService";
import { createAdmin, createCustomer, cleanupByTag, newTag, type FixtureTag } from "./support/customerFixtures";

// سطح المهام — الخدمة كانت كاملة وبلا أي مسار أو شاشة: المهام تُنشأ (مراجعة
// احتيال، تعارض فصل دمج) ولا يستطيع أحد رؤيتها ولا إغلاقها.

const maybeDescribe = process.env.TEST_DATABASE_URL ? describe : describe.skip;

maybeDescribe("سطح المهام (integration)", () => {
  let tag: FixtureTag;
  let adminId: string;
  let customerId: string;

  beforeAll(async () => {
    tag = newTag("tasks");
    adminId = await createAdmin(tag);
    customerId = (await createCustomer(tag)).id;
  });

  afterAll(async () => {
    await prisma.task.deleteMany({ where: { customerId } });
    await prisma.auditLog.deleteMany({ where: { entityType: "task" } });
    await cleanupByTag(tag);
  });

  it("المهمة المُنشأة تظهر في القائمة بترتيب حتمي", async () => {
    await createTask({ type: "manual_review", customerId, priority: "high", source: "automation" });
    await createTask({ type: "follow_up", customerId, source: "manual" });

    const first = await listTasks({ page: 1, pageSize: 50 });
    const mine = first.items.filter((t) => t.customerId === customerId);
    expect(mine.length).toBeGreaterThanOrEqual(2);

    // نفس الاستعلام مرتين ⇒ نفس الترتيب بالضبط
    const again = await listTasks({ page: 1, pageSize: 50 });
    expect(again.items.map((t) => t.id)).toEqual(first.items.map((t) => t.id));
  });

  it("الفلترة بالحالة والنوع تعمل، والسقف مفروض من الخادم", async () => {
    const open = await listTasks({ status: "open", page: 1, pageSize: 50 });
    expect(open.items.every((t) => t.status === "open")).toBe(true);

    const reviews = await listTasks({ type: "manual_review", page: 1, pageSize: 50 });
    expect(reviews.items.every((t) => t.type === "manual_review")).toBe(true);

    const bounded = await listTasks({ page: 1, pageSize: 1 });
    expect(bounded.items).toHaveLength(1);
    expect(bounded.total).toBeGreaterThanOrEqual(2);
  });

  it("المتأخرة تُحتسب من الخدمة لا من ساعة العارض", async () => {
    const overdue = await createTask({ type: "follow_up", customerId, source: "automation" });
    await prisma.task.update({
      where: { id: overdue.id },
      data: { dueAt: new Date(Date.now() - 3 * 60 * 60 * 1000) },
    });

    const list = await listTasks({ overdueOnly: true, page: 1, pageSize: 50 });
    const row = list.items.find((t) => t.id === overdue.id);
    expect(row?.isOverdue).toBe(true);
    expect(await tasksOverdueCount()).toBeGreaterThanOrEqual(1);

    // مهمة غير مستحقة بعد ليست متأخرة
    const future = await createTask({ type: "follow_up", customerId, source: "automation" });
    await prisma.task.update({
      where: { id: future.id },
      data: { dueAt: new Date(Date.now() + 60 * 60 * 1000) },
    });
    const all = await listTasks({ page: 1, pageSize: 50 });
    expect(all.items.find((t) => t.id === future.id)?.isOverdue).toBe(false);
  });

  it("الإغلاق يعمل مرة واحدة فقط (CAS) ويُسجَّل الفاعل والوقت", async () => {
    const task = await createTask({ type: "manual_review", customerId, source: "automation" });

    await completeTask(task.id, adminId, "أُنجزت");
    const done = await prisma.task.findUniqueOrThrow({
      where: { id: task.id },
      select: { status: true, completedById: true, completedAt: true },
    });
    expect(done.status).toBe("done");
    expect(done.completedById).toBe(adminId);
    expect(done.completedAt).not.toBeNull();

    // إغلاق ثانٍ مرفوض حتميًا — لا إغلاق مزدوج
    await expect(completeTask(task.id, adminId)).rejects.toBeInstanceOf(TaskNotFoundError);
  });

  it("المهمة المنجزة تخرج من قائمة المفتوحة", async () => {
    const openBefore = await listTasks({ status: "open", page: 1, pageSize: 50 });
    const task = await createTask({ type: "follow_up", customerId, source: "automation" });
    await completeTask(task.id, adminId);

    const openAfter = await listTasks({ status: "open", page: 1, pageSize: 50 });
    expect(openAfter.items.map((t) => t.id)).not.toContain(task.id);
    expect(openAfter.total).toBe(openBefore.total);
  });
});
