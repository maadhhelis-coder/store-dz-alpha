import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/requirePermission";
import { p6ErrorResponse, invalidBody } from "@/lib/p6RouteErrors";
import { createReturnSchema, returnsListQuerySchema } from "@/lib/validation/financeSchema";
import { createReturn, listReturns } from "@/server/modules/returns/returnsService";

// دورات الإرجاع — القراءة returns.read، الإنشاء returns.manage.

export async function GET(request: Request) {
  try {
    await requirePermission("returns.read");
    const parsed = returnsListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) return invalidBody(parsed.error.flatten());
    return NextResponse.json(await listReturns(parsed.data));
  } catch (error) {
    return p6ErrorResponse(error, "returns list");
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requirePermission("returns.manage");
    const parsed = createReturnSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return invalidBody(parsed.error.flatten());
    const created = await createReturn({
      ...parsed.data,
      actor: { type: "admin", id: admin.id },
      correlationId: request.headers.get("x-request-id"),
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return p6ErrorResponse(error, "return create");
  }
}
