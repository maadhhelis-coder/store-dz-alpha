import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/requirePermission";
import { p6ErrorResponse, invalidBody } from "@/lib/p6RouteErrors";
import { importSettlementSchema, settlementsListQuerySchema } from "@/lib/validation/financeSchema";
import { importCodSettlement, listSettlements } from "@/server/modules/finance/codSettlementService";

// تسويات COD — القراءة finance.read، الاستيراد finance.reconcile.
// الاستيراد idempotent بهوية provider+reconciliationKey (راجع الخدمة): إعادة نفس
// الكشف تُرجع 200 بـreplayed=true، ونفس الهوية بمحتوى مختلف 409.

export async function GET(request: Request) {
  try {
    await requirePermission("finance.read");
    const parsed = settlementsListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) return invalidBody(parsed.error.flatten());
    return NextResponse.json(await listSettlements(parsed.data));
  } catch (error) {
    return p6ErrorResponse(error, "settlements list");
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requirePermission("finance.reconcile");
    const parsed = importSettlementSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return invalidBody(parsed.error.flatten());
    const result = await importCodSettlement({
      ...parsed.data,
      actor: { type: "admin", id: admin.id },
      correlationId: request.headers.get("x-request-id"),
    });
    return NextResponse.json(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    return p6ErrorResponse(error, "settlement import");
  }
}
