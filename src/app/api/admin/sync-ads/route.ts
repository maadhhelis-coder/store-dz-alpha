import { NextResponse } from "next/server";
import { UnauthorizedError, ForbiddenError } from "@/lib/auth/requireAdmin";
import { requirePermission } from "@/lib/auth/requirePermission";
import { syncAllAds } from "@/server/services/adsSyncService";

export const maxDuration = 60;

// زر "مزامنة الآن" اليدوي في لوحة التحكم — نفس منطق الـ cron لكن مُشغَّل بضغطة زر.
export async function POST() {
  try {
    await requirePermission("integrations.manage");
    const result = await syncAllAds();
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("manual ads sync error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}
