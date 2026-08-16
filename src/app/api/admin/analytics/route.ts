import { NextResponse } from "next/server";
import { requireAdmin, UnauthorizedError } from "@/lib/auth/requireAdmin";
import { getAnalyticsOverview } from "@/server/services/analyticsService";
import type { AnalyticsRange } from "@/server/repositories/analyticsRepository";

const VALID_RANGES: AnalyticsRange[] = ["today", "yesterday", "7d", "30d", "all"];

export async function GET(request: Request) {
  try {
    await requireAdmin();

    const { searchParams } = new URL(request.url);
    const rangeParam = searchParams.get("range");
    const range = VALID_RANGES.includes(rangeParam as AnalyticsRange) ? (rangeParam as AnalyticsRange) : "30d";

    const overview = await getAnalyticsOverview(range);
    return NextResponse.json(overview);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("get analytics error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}
