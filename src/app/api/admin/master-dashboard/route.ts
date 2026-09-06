import { NextResponse } from "next/server";
import { UnauthorizedError, ForbiddenError } from "@/lib/auth/requireAdmin";
import { requirePermission } from "@/lib/auth/requirePermission";
import { getMasterDashboard } from "@/server/services/masterDashboardService";
import type { AnalyticsRange } from "@/server/repositories/analyticsRepository";

const VALID_RANGES: AnalyticsRange[] = ["today", "yesterday", "7d", "30d", "all"];

export async function GET(request: Request) {
  try {
    await requirePermission("analytics.read");

    const { searchParams } = new URL(request.url);
    const rangeParam = searchParams.get("range");
    const range = VALID_RANGES.includes(rangeParam as AnalyticsRange) ? (rangeParam as AnalyticsRange) : "30d";

    const productSlugParam = searchParams.get("productSlug");
    const productSlug =
      productSlugParam && /^[a-z0-9-]{1,200}$/.test(productSlugParam) ? productSlugParam : undefined;

    const wilayaCodeParam = searchParams.get("wilayaCode");
    const wilayaCodeNum = wilayaCodeParam ? Number(wilayaCodeParam) : NaN;
    const wilayaCode =
      Number.isInteger(wilayaCodeNum) && wilayaCodeNum >= 1 && wilayaCodeNum <= 58 ? wilayaCodeNum : undefined;

    const dashboard = await getMasterDashboard(range, { productSlug, wilayaCode });
    return NextResponse.json(dashboard);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("get master dashboard error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}
