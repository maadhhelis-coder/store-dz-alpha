import { NextResponse } from "next/server";
import { requireAdmin, UnauthorizedError } from "@/lib/auth/requireAdmin";
import { getProductPageAnalytics, getLandingPageAnalytics } from "@/server/services/pageAnalyticsService";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const kind = new URL(request.url).searchParams.get("kind");

    if (kind === "landing") {
      const platforms = await getLandingPageAnalytics();
      return NextResponse.json({ platforms });
    }

    const platforms = await getProductPageAnalytics();
    return NextResponse.json({ platforms });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("page analytics error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}
