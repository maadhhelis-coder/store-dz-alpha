import { NextResponse } from "next/server";
import { z } from "zod";
import { UnauthorizedError, ForbiddenError } from "@/lib/auth/requireAdmin";
import { requirePermission } from "@/lib/auth/requirePermission";
import {
  unmergeCustomer,
  raiseUnmergeReviewTask,
  CustomerMergeError,
} from "@/server/modules/customers/mergeService";

// فصل دمج — customers.merge (نفس صلاحية الدمج: عملية واحدة باتجاهين).
// الاستعادة حصرًا من الـmanifest؛ ما أُنشئ بعد الدمج يبقى مع الـsurvivor.
//
// UNMERGE_CONFLICT = استحالة استعادة أمينة (تغيّرت الملكية بعد الدمج): الخدمة
// تُلغي المعاملة كاملة، والـroute يفتح مهمة مراجعة يدوية بدل ترك الحالة معلّقة
// بلا أثر. فشل إنشاء المهمة نفسه لا يُخفي التعارض الأصلي عن المستدعي.

const bodySchema = z.object({
  mergedId: z.string().uuid(),
  reason: z.string().trim().max(500).optional(),
});

export async function POST(request: Request) {
  try {
    const admin = await requirePermission("customers.merge");
    const body = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "بيانات غير صحيحة", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    try {
      const result = await unmergeCustomer({
        mergedId: parsed.data.mergedId,
        actorId: admin.id,
        reason: parsed.data.reason ?? null,
      });
      return NextResponse.json({ ok: true, ...result });
    } catch (error) {
      if (error instanceof CustomerMergeError && error.code === "UNMERGE_CONFLICT") {
        await raiseUnmergeReviewTask({
          mergedId: parsed.data.mergedId,
          actorId: admin.id,
          error,
        }).catch((taskError) => console.error("raise unmerge review task failed", taskError));
        return NextResponse.json(
          { error: error.message, code: error.code, manualReviewCreated: true },
          { status: 409 },
        );
      }
      throw error;
    }
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof CustomerMergeError) {
      if (error.code === "NOT_FOUND" || error.code === "NO_MERGE_RECORD") {
        return NextResponse.json({ error: error.message, code: error.code }, { status: 404 });
      }
      if (error.code === "ALREADY_RESTORED" || error.code === "SURVIVOR_NOT_ACTIVE") {
        return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
      }
      return NextResponse.json({ error: error.message, code: error.code }, { status: 422 });
    }
    console.error("customer unmerge error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}
