import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/requirePermission";
import { p6ErrorResponse } from "@/lib/p6RouteErrors";
import { getReturn } from "@/server/modules/returns/returnsService";

const paramsSchema = z.object({ id: z.string().uuid() });

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("returns.read");
    const params = paramsSchema.safeParse(await context.params);
    if (!params.success) return NextResponse.json({ error: "معرّف غير صحيح" }, { status: 400 });
    const record = await getReturn(params.data.id);
    if (!record) return NextResponse.json({ error: "دورة الإرجاع غير موجودة" }, { status: 404 });
    return NextResponse.json(record);
  } catch (error) {
    return p6ErrorResponse(error, "return get");
  }
}
