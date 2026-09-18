import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/requirePermission";
import { p6ErrorResponse, invalidBody } from "@/lib/p6RouteErrors";
import { resolveSettlementItemSchema } from "@/lib/validation/financeSchema";
import { resolveSettlementItem } from "@/server/modules/finance/codSettlementService";

const paramsSchema = z.object({ id: z.string().uuid() });

// حل سطر فرق في تسوية — finance.reconcile بسبب إلزامي؛ التسوية تُغلق آليًا حين
// لا يبقى فيها سطر مفتوح.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requirePermission("finance.reconcile");
    const params = paramsSchema.safeParse(await context.params);
    if (!params.success) return NextResponse.json({ error: "معرّف غير صحيح" }, { status: 400 });
    const parsed = resolveSettlementItemSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return invalidBody(parsed.error.flatten());
    const item = await resolveSettlementItem({
      itemId: parsed.data.itemId,
      settlementId: params.data.id,
      reason: parsed.data.reason,
      actor: { type: "admin", id: admin.id },
      correlationId: request.headers.get("x-request-id"),
    });
    return NextResponse.json(item);
  } catch (error) {
    return p6ErrorResponse(error, "settlement resolve");
  }
}
