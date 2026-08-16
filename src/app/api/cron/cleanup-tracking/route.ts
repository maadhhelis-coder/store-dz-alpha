import { NextResponse } from "next/server";
import { cleanupOldTrackingData } from "@/server/services/dataRetentionService";
import { verifyCronSecret } from "@/lib/auth/verifyCronSecret";

// يمنح حذف الدفعات الكبيرة (أول تشغيل بعد تراكم أشهر من البيانات) وقتًا كافيًا بدل الحد
// الافتراضي (10 ثوانٍ على خطة Hobby)، بنفس منطق sync-ads.
export const maxDuration = 60;

// يُستدعى تلقائيًا عبر Vercel Cron (راجع vercel.json). محمي بمقارنة CRON_SECRET التي
// يُرسلها Vercel تلقائيًا في ترويسة Authorization عند ضبط متغيّر البيئة CRON_SECRET.
// فشل مغلق: غياب CRON_SECRET أو خطؤه = رفض دائمًا (راجع verifyCronSecret).
export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  try {
    const result = await cleanupOldTrackingData();
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("tracking cleanup cron error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}
