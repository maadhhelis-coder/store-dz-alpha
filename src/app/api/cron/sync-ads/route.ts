import { NextResponse } from "next/server";
import { syncAllAds } from "@/server/services/adsSyncService";
import { verifyCronSecret } from "@/lib/auth/verifyCronSecret";

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

  try {
    const result = await syncAllAds();
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("ads cron sync error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}
