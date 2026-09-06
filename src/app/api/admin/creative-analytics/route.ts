import { NextResponse } from "next/server";
import { UnauthorizedError, ForbiddenError } from "@/lib/auth/requireAdmin";
import { requirePermission } from "@/lib/auth/requirePermission";
import { getCreativeAnalytics, getStoreWideRates } from "@/server/services/creativeAnalyticsService";

export async function GET() {
  try {
    await requirePermission("analytics.read");
    const [platforms, storeWide] = await Promise.all([getCreativeAnalytics(), getStoreWideRates()]);
    return NextResponse.json({ platforms, storeWide });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("creative analytics error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}
