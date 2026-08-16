import { NextResponse } from "next/server";
import { requireAdmin, UnauthorizedError } from "@/lib/auth/requireAdmin";
import { getCreativeAnalytics, getStoreWideRates } from "@/server/services/creativeAnalyticsService";

export async function GET() {
  try {
    await requireAdmin();
    const [platforms, storeWide] = await Promise.all([getCreativeAnalytics(), getStoreWideRates()]);
    return NextResponse.json({ platforms, storeWide });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("creative analytics error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}
