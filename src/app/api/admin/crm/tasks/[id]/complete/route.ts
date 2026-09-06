import { NextResponse } from "next/server";
import { z } from "zod";
import { UnauthorizedError, ForbiddenError } from "@/lib/auth/requireAdmin";
import { requirePermission } from "@/lib/auth/requirePermission";
import { completeTask, TaskNotFoundError } from "@/server/modules/tasks/tasksService";
import { writeAudit } from "@/server/services/auditService";

// إغلاق مهمة — tasks.manage. الخدمة تُغلق بـCAS (المكتملة مسبقًا تُرفض) فلا
// إغلاق مزدوج، والتوثيق هنا يسجّل الفاعل والسبب.

const paramsSchema = z.object({ id: z.string().uuid() });
const bodySchema = z.object({ note: z.string().trim().max(500).optional() });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requirePermission("tasks.manage");

    const parsedParams = paramsSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      return NextResponse.json({ error: "معرّف مهمة غير صحيح" }, { status: 400 });
    }
    const body = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(body ?? {});
    if (!parsed.success) {
      return NextResponse.json(
        { error: "بيانات غير صحيحة", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    await completeTask(parsedParams.data.id, admin.id, parsed.data.note);

    await writeAudit({
      actorType: "admin",
      actorId: admin.id,
      action: "task_completed",
      entityType: "task",
      entityId: parsedParams.data.id,
      after: { status: "done" },
      reason: parsed.data.note ?? null,
    });

    return NextResponse.json({ ok: true, taskId: parsedParams.data.id, status: "done" });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof TaskNotFoundError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 404 });
    }
    console.error("complete task error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}
