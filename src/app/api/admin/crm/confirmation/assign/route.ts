import { NextResponse } from "next/server";
import { z } from "zod";
import { UnauthorizedError, ForbiddenError } from "@/lib/auth/requireAdmin";
import { requirePermission } from "@/lib/auth/requirePermission";
import {
  selfAssignOrder,
  unassignOrder,
  AssignmentConflictError,
  OrderNotFoundError,
} from "@/server/modules/confirmation/confirmationService";

const bodySchema = z.object({ orderId: z.string().uuid() });

// إسناد ذاتي CAS (orders.assign) — POST للإسناد، DELETE للتحرير.
// موظفان متزامنان: الفائز الأول فقط ينجح؛ الخاسر يحصل 409 حتميًا.

export async function POST(request: Request) {
  try {
    const admin = await requirePermission("orders.assign");
    const body = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "بيانات غير صحيحة", details: parsed.error.flatten() }, { status: 400 });
    }
    await selfAssignOrder(parsed.data.orderId, admin.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof OrderNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof AssignmentConflictError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    }
    console.error("self assign error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const admin = await requirePermission("orders.assign");
    const body = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "بيانات غير صحيحة", details: parsed.error.flatten() }, { status: 400 });
    }
    await unassignOrder(parsed.data.orderId);
    void admin;
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
    console.error("unassign error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}
