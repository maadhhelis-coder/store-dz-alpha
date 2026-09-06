import { NextResponse } from "next/server";
import { z } from "zod";
import { TaskStatus, TaskType } from "@prisma/client";
import { UnauthorizedError, ForbiddenError } from "@/lib/auth/requireAdmin";
import { requirePermission } from "@/lib/auth/requirePermission";
import { listTasks, tasksOverdueCount } from "@/server/modules/tasks/tasksService";

// قائمة المهام — tasks.read. الترتيب حتمي (dueAt ثم id) والحجم مسقوف من الخادم.
//
// كانت الخدمة كاملة وبلا أي مسار أو شاشة: المهام تُنشأ (مراجعة احتيال، تعارض
// فصل دمج) ولا يستطيع أحد رؤيتها ولا إغلاقها — أي أن "high fraud يفتح مراجعة
// يدوية" كان يكتب صفًا لا يقرأه بشر.

const querySchema = z.object({
  status: z.enum(TaskStatus).optional(),
  type: z.enum(TaskType).optional(),
  assigneeId: z.string().uuid().optional(),
  overdueOnly: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export async function GET(request: Request) {
  try {
    await requirePermission("tasks.read");

    const url = new URL(request.url);
    const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "بيانات غير صحيحة", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const [result, overdue] = await Promise.all([listTasks(parsed.data), tasksOverdueCount()]);
    return NextResponse.json({
      ...result,
      overdue,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      totalPages: Math.max(1, Math.ceil(result.total / parsed.data.pageSize)),
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("list tasks error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}
