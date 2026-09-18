import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/requirePermission";
import { p8ErrorResponse } from "@/lib/p8RouteErrors";
import { getSystemStatus } from "@/server/modules/observability/systemStatusService";

// حالة النظام التفصيلية — settings.read (بلا أسرار). /api/health العام يبقى {status} فقط.
export async function GET() {
  try {
    await requirePermission("settings.read");
    return NextResponse.json(await getSystemStatus(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return p8ErrorResponse(error, "system status");
  }
}
