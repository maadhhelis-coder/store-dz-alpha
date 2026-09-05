import { NextResponse } from "next/server";
import { z } from "zod";
import { UnauthorizedError, ForbiddenError } from "@/lib/auth/requireAdmin";
import { requirePermission } from "@/lib/auth/requirePermission";
import { reviewFraudSignal, FraudSignalNotFoundError } from "@/server/modules/fraud/fraudQueries";

// مراجعة إشارة احتيال — fraud.review. القرار بشري بحت: يغيّر حالة الإشارة فقط
// ولا يمس حالة أي طلب إطلاقًا (fraud_suspected تمر عبر آلة الحالات وحدها).

const paramsSchema = z.object({ id: z.string().uuid() });
const bodySchema = z.object({
  status: z.enum(["reviewed", "dismissed"]),
  reason: z.string().trim().min(1).max(500),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requirePermission("fraud.review");

    const parsedParams = paramsSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      return NextResponse.json({ error: "معرّف إشارة غير صحيح" }, { status: 400 });
    }
    const body = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "بيانات غير صحيحة", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const result = await reviewFraudSignal({
      signalId: parsedParams.data.id,
      status: parsed.data.status,
      reason: parsed.data.reason,
      actorId: admin.id,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof FraudSignalNotFoundError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 404 });
    }
    console.error("fraud signal review error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}
