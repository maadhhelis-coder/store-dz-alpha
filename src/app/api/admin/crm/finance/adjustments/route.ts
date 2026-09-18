import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/requirePermission";
import { p6ErrorResponse, invalidBody } from "@/lib/p6RouteErrors";
import { IdempotencyInFlightError, IdempotencyKeyReusedError } from "@/server/modules/idempotency/durableIdempotency";
import { adjustmentsListQuerySchema, createAdjustmentSchema } from "@/lib/validation/financeSchema";
import {
  createFinancialAdjustment,
  listFinancialAdjustments,
} from "@/server/modules/finance/financialAdjustmentsService";

// التعديلات المالية — القراءة finance.read، الإنشاء finance.adjust. لا PATCH ولا
// DELETE بتصميم: السجل غير قابل للتغيير، والتصحيح تعديل تعويضي جديد.

export async function GET(request: Request) {
  try {
    await requirePermission("finance.read");
    const parsed = adjustmentsListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) return invalidBody(parsed.error.flatten());
    return NextResponse.json(await listFinancialAdjustments(parsed.data));
  } catch (error) {
    return p6ErrorResponse(error, "adjustments list");
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requirePermission("finance.adjust");
    const parsed = createAdjustmentSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return invalidBody(parsed.error.flatten());
    const created = await createFinancialAdjustment({
      ...parsed.data,
      actor: { type: "admin", id: admin.id },
      correlationId: request.headers.get("x-request-id"),
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof IdempotencyKeyReusedError || error instanceof IdempotencyInFlightError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    }
    return p6ErrorResponse(error, "adjustment create");
  }
}
