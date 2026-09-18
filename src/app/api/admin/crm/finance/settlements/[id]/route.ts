import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/requirePermission";
import { p6ErrorResponse } from "@/lib/p6RouteErrors";
import { getSettlement } from "@/server/modules/finance/codSettlementService";

const paramsSchema = z.object({ id: z.string().uuid() });

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("finance.read");
    const params = paramsSchema.safeParse(await context.params);
    if (!params.success) return NextResponse.json({ error: "معرّف غير صحيح" }, { status: 400 });
    const settlement = await getSettlement(params.data.id);
    if (!settlement) return NextResponse.json({ error: "التسوية غير موجودة" }, { status: 404 });
    return NextResponse.json(settlement);
  } catch (error) {
    return p6ErrorResponse(error, "settlement get");
  }
}
