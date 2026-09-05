import { NextResponse } from "next/server";
import { z } from "zod";
import { UnauthorizedError, ForbiddenError } from "@/lib/auth/requireAdmin";
import { requirePermission } from "@/lib/auth/requirePermission";
import {
  acknowledgeAlert,
  AlertNotFoundError,
  AlertInvalidTransitionError,
} from "@/server/modules/alerts/alertsService";

// إقرار تنبيه — integrations.manage (مالكوية). CAS من open حصرًا؛ التنبيه المحلول
// أو المُقرّ مسبقًا يُرفض بـ409 حتميًا.

const paramsSchema = z.object({ id: z.string().uuid() });

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: RouteParams) {
  try {
    const admin = await requirePermission("integrations.manage");
    const parsed = paramsSchema.safeParse(await params);
    if (!parsed.success) {
      return NextResponse.json({ error: "بيانات غير صحيحة", details: parsed.error.flatten() }, { status: 400 });
    }

    await acknowledgeAlert(parsed.data.id, admin.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof AlertNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof AlertInvalidTransitionError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    }
    console.error("alert acknowledge error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}
