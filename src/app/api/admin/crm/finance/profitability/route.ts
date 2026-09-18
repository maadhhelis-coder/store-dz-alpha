import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/requirePermission";
import { p6ErrorResponse, invalidBody } from "@/lib/p6RouteErrors";
import { profitabilityQuerySchema, resolveProfitWindow } from "@/lib/validation/financeSchema";
import { getProfitabilityReport } from "@/server/modules/finance/profitabilityService";

export const maxDuration = 60;

// تقرير الربحية — finance.read. الحساب كله في محرك الربحية (مصدر واحد)؛ هذا
// المسار يحلّ الفترة ويمرّر البُعد فقط.
export async function GET(request: Request) {
  try {
    await requirePermission("finance.read");
    const parsed = profitabilityQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) return invalidBody(parsed.error.flatten());
    const report = await getProfitabilityReport(resolveProfitWindow(parsed.data), parsed.data.dimension);
    return NextResponse.json(report);
  } catch (error) {
    return p6ErrorResponse(error, "profitability");
  }
}
