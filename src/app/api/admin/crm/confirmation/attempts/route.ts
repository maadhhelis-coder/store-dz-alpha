import { NextResponse } from "next/server";
import { UnauthorizedError, ForbiddenError } from "@/lib/auth/requireAdmin";
import { requirePermission } from "@/lib/auth/requirePermission";
import {
  recordConfirmationAttempt,
  OrderNotFoundError,
  OrderNotPendingError,
} from "@/server/modules/confirmation/confirmationService";
import { recordAttemptSchema } from "@/lib/validation/confirmationSchema";
import {
  IdempotencyKeyReusedError,
  IdempotencyInFlightError,
} from "@/server/modules/idempotency/durableIdempotency";
import { InvalidTransitionError } from "@/server/modules/orders/stateMachine";
import { InsufficientStockError } from "@/server/modules/orders/statusService";

export const maxDuration = 60;

// تسجيل محاولة تأكيد — صلاحية orders.confirm (نتيجة confirmed تنتقل عبر آلة
// الحالات؛ النتائج الأخرى تحدّث الجدولة فقط). idempotent بمفتاح العميل.

export async function POST(request: Request) {
  try {
    const admin = await requirePermission("orders.confirm");
    const body = await request.json().catch(() => null);
    const parsed = recordAttemptSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "بيانات غير صحيحة", details: parsed.error.flatten() }, { status: 400 });
    }

    const result = await recordConfirmationAttempt({
      orderId: parsed.data.orderId,
      outcome: parsed.data.outcome,
      note: parsed.data.note,
      nextFollowUpAt: parsed.data.nextFollowUpAt ? new Date(parsed.data.nextFollowUpAt) : null,
      durationSec: parsed.data.durationSec ?? null,
      idempotencyKey: parsed.data.idempotencyKey ?? null,
      actor: { type: "admin", id: admin.id },
      correlationId: request.headers.get("x-request-id"),
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof OrderNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof OrderNotPendingError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    }
    if (error instanceof InvalidTransitionError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    }
    if (error instanceof InsufficientStockError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof IdempotencyKeyReusedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    }
    if (error instanceof IdempotencyInFlightError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    }
    console.error("record confirmation attempt error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}
