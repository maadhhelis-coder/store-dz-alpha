import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAllPermissions } from "@/lib/auth/requirePermission";
import { p6ErrorResponse, invalidBody } from "@/lib/p6RouteErrors";
import { restockSchema } from "@/lib/validation/financeSchema";
import { restockReturnItems } from "@/server/modules/returns/returnsService";

const paramsSchema = z.object({ id: z.string().uuid() });

// الاسترجاع للمخزون — يمسّ المخزون فعليًا فيتطلب returns.manage وinventory.adjust معًا.
// idempotent: نفس الكميات مرة ثانية = applied فارغة، لا مخزون مكرَّر.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAllPermissions(["returns.manage", "inventory.adjust"]);
    const params = paramsSchema.safeParse(await context.params);
    if (!params.success) return NextResponse.json({ error: "معرّف غير صحيح" }, { status: 400 });
    const parsed = restockSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return invalidBody(parsed.error.flatten());
    const result = await restockReturnItems({
      returnId: params.data.id,
      items: parsed.data.items,
      reason: parsed.data.reason ?? null,
      actor: { type: "admin", id: admin.id },
      correlationId: request.headers.get("x-request-id"),
    });
    return NextResponse.json(result);
  } catch (error) {
    return p6ErrorResponse(error, "return restock");
  }
}
