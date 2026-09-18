import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/requirePermission";
import { p6ErrorResponse, invalidBody } from "@/lib/p6RouteErrors";
import { returnStatusSchema } from "@/lib/validation/financeSchema";
import { transitionReturnStatus } from "@/server/modules/returns/returnsService";

const paramsSchema = z.object({ id: z.string().uuid() });

// انتقال حالة دورة الإرجاع — returns.manage. received يُحوّل الطلب إلى returned
// عبر آلة الحالات (لا استرجاع مخزون هنا أبدًا).
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requirePermission("returns.manage");
    const params = paramsSchema.safeParse(await context.params);
    if (!params.success) return NextResponse.json({ error: "معرّف غير صحيح" }, { status: 400 });
    const parsed = returnStatusSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return invalidBody(parsed.error.flatten());
    const updated = await transitionReturnStatus({
      returnId: params.data.id,
      to: parsed.data.status,
      reason: parsed.data.reason ?? null,
      outboundShippingCostDzd: parsed.data.outboundShippingCostDzd,
      returnShippingCostDzd: parsed.data.returnShippingCostDzd,
      actor: { type: "admin", id: admin.id },
      correlationId: request.headers.get("x-request-id"),
    });
    return NextResponse.json(updated);
  } catch (error) {
    return p6ErrorResponse(error, "return status");
  }
}
