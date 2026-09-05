import { NextResponse } from "next/server";
import { UnauthorizedError, ForbiddenError } from "@/lib/auth/requireAdmin";
import { requirePermission } from "@/lib/auth/requirePermission";
import { getAgentPerformance } from "@/server/modules/confirmation/agentPerformanceService";
import { agentPerformanceQuerySchema } from "@/lib/validation/confirmationSchema";

// أداء المؤكِّدين — analytics.read؛ فلاتر تاريخ اختيارية.

export async function GET(request: Request) {
  try {
    await requirePermission("analytics.read");
    const url = new URL(request.url);
    const parsed = agentPerformanceQuerySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) {
      return NextResponse.json({ error: "بيانات غير صحيحة", details: parsed.error.flatten() }, { status: 400 });
    }
    const rows = await getAgentPerformance({
      dateFrom: parsed.data.dateFrom ? new Date(parsed.data.dateFrom) : undefined,
      dateTo: parsed.data.dateTo ? new Date(parsed.data.dateTo) : undefined,
      agentId: parsed.data.agentId,
    });
    return NextResponse.json({ items: rows });
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
    console.error("agent performance error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}
