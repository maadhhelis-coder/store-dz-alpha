import { NextResponse } from "next/server";
import { syncAllAds } from "@/server/services/adsSyncService";
import { verifyCronSecret } from "@/lib/auth/verifyCronSecret";
import { runJob } from "@/server/modules/jobs/jobRunner";

// يمنح مزامنة الحسابات الإعلانية الكبيرة (مئات الكرياتيفات) وقتًا كافيًا بدل الحد
// الافتراضي (10 ثوانٍ على خطة Hobby) الذي قد يقطع المزامنة في المنتصف.
export const maxDuration = 60;

// يُستدعى تلقائيًا عبر Vercel Cron (راجع vercel.json). محمي بمقارنة CRON_SECRET التي
// يُرسلها Vercel تلقائيًا في ترويسة Authorization عند ضبط متغيّر البيئة CRON_SECRET.
// فشل مغلق: غياب CRON_SECRET أو خطؤه = رفض دائمًا (راجع verifyCronSecret).
export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  // عبر runJob مثل بقية المهام: صف في job_runs + قفل + تنبيه system_alerts عند الفشل.
  // بدونه كانت هذه المهمة تفشل بصمت إلى الأبد بلا أي أثر يراه صاحب المتجر (سجلّات
  // Vercel فقط)، فيظل يرى أرقام إعلانات قديمة ويحسب ربحيته عليها.
  try {
    const outcome = await runJob("sync-ads", () => syncAllAds());
    if (outcome.status === "skipped_locked") {
      return NextResponse.json({ ok: true, skipped: "locked" });
    }
    return NextResponse.json({ ok: true, result: outcome.result, durationMs: outcome.durationMs });
  } catch (error) {
    console.error("ads cron sync error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}
