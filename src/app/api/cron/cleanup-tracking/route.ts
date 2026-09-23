import { NextResponse } from "next/server";
import { cleanupOldTrackingData } from "@/server/services/dataRetentionService";
import { verifyCronSecret } from "@/lib/auth/verifyCronSecret";
import { runJob } from "@/server/modules/jobs/jobRunner";

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

  // عبر runJob مثل بقية المهام — راجع التعليق في sync-ads: مهمة حذف تفشل بصمت تعني
  // جداول التتبّع تنمو بلا حد حتى تمتلئ القاعدة، وصاحب المتجر لا يرى شيئًا.
  try {
    const outcome = await runJob("cleanup-tracking", () => cleanupOldTrackingData());
    if (outcome.status === "skipped_locked") {
      return NextResponse.json({ ok: true, skipped: "locked" });
    }
    return NextResponse.json({ ok: true, result: outcome.result, durationMs: outcome.durationMs });
  } catch (error) {
    console.error("tracking cleanup cron error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}
