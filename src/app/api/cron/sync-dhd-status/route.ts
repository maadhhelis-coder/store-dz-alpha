import { NextResponse } from "next/server";
import { syncAllDhdOrderStatuses } from "@/server/services/dhdService";
import { verifyCronSecret } from "@/lib/auth/verifyCronSecret";

// نفس منطق المزامنة الإعلانية (راجع src/app/api/cron/sync-ads/route.ts) — عدد الطلبات
// النشطة صغير عادة، فلا حاجة لمهلة أطول من الافتراضي.
export const maxDuration = 30;

// يُستدعى تلقائيًا عبر Vercel Cron (راجع vercel.json). محمي بنفس آلية CRON_SECRET.
export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  try {
    const result = await syncAllDhdOrderStatuses();
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("dhd status cron sync error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}
