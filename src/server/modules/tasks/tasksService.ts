import { prisma } from "@/server/db/prisma";
import { getCrmSetting } from "@/server/modules/settings/crmSettingsService";
import type { Prisma, TaskPriority, TaskStatus, TaskType } from "@prisma/client";

// خدمة المهام — تُنشأ من الأتمتة (P7) أو يدويًا؛ SLA من crm_settings حسب النوع
// (تصحيح 13/63)؛ الاكتمال موثّق بفاعل ووقت؛ الاستعلامات bounded.

export class TaskNotFoundError extends Error {
  readonly code = "NOT_FOUND";

  constructor() {
    super("المهمة غير موجودة أو مكتملة مسبقًا");
    this.name = "TaskNotFoundError";
  }
}

export async function createTask(input: {
  type: TaskType;
  orderId?: string | null;
  customerId?: string | null;
  assigneeId?: string | null;
  priority?: TaskPriority;
  dueAt?: Date | null;
  payload?: Record<string, unknown>;
  createdById?: string | null;
  source?: "automation" | "manual";
}) {
  const slaMinutes = (await getCrmSetting("task_sla_minutes"))[input.type];
  return prisma.task.create({
    data: {
      type: input.type,
      orderId: input.orderId ?? null,
      customerId: input.customerId ?? null,
      assigneeId: input.assigneeId ?? null,
      priority: input.priority ?? "normal",
      dueAt: input.dueAt ?? new Date(Date.now() + slaMinutes * 60 * 1000),
      slaMinutes,
      source: input.source ?? "manual",
      payload: (input.payload ?? undefined) as Prisma.InputJsonValue | undefined,
      createdById: input.createdById ?? null,
    },
  });
}

/** إكمال CAS — المهمة المكتملة مسبقًا تُرفض (لا إكمال مزدوج). */
export async function completeTask(taskId: string, actorId: string, note?: string) {
  const updated = await prisma.task.updateMany({
    where: { id: taskId, status: { in: ["open", "in_progress"] } },
    data: {
      status: "done",
      completedAt: new Date(),
      completedById: actorId,
      ...(note
        ? { payload: { completionNote: note } as unknown as Prisma.InputJsonValue }
        : {}),
    },
  });
  if (updated.count === 0) throw new TaskNotFoundError();
}

export async function listTasks(params: {
  status?: TaskStatus;
  type?: TaskType;
  assigneeId?: string;
  overdueOnly?: boolean;
  page: number;
  pageSize: number;
}) {
  const now = new Date();
  const where: Prisma.TaskWhereInput = {
    ...(params.status ? { status: params.status } : {}),
    ...(params.type ? { type: params.type } : {}),
    ...(params.assigneeId ? { assigneeId: params.assigneeId } : {}),
    ...(params.overdueOnly
      ? { status: { in: ["open", "in_progress"] }, dueAt: { lt: now } }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.task.findMany({
      where,
      // ترتيب حتمي — breaker بid (سياسة 89)
      orderBy: [{ dueAt: "asc" }, { id: "asc" }],
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.task.count({ where }),
  ]);
  // "متأخرة" حكم نطاق لا عرض: يُحسب هنا مقابل ساعة واحدة لكل الصفوف، فلا يقرأ
  // المستهلك الساعة بنفسه (ولا يختلف صفّان في نفس الصفحة على معنى التأخر).
  const items = rows.map((task) => ({
    ...task,
    isOverdue:
      task.dueAt !== null &&
      task.dueAt.getTime() < now.getTime() &&
      (task.status === "open" || task.status === "in_progress"),
  }));
  return { items, total };
}

/** عدد المتأخرات للوحة/الصحة — count فقط بلا صفوف. */
export async function tasksOverdueCount(): Promise<number> {
  return prisma.task.count({
    where: { status: { in: ["open", "in_progress"] }, dueAt: { lt: new Date() } },
  });
}
