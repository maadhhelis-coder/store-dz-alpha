import { timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireAdmin, UnauthorizedError } from "@/lib/auth/requireAdmin";
import { handleGmailCallback } from "@/server/services/emailIntegrationsService";
import { OAUTH_STATE_COOKIE } from "@/app/api/admin/email-integrations/[provider]/connect/route";

// مقارنة بزمن ثابت — تفادي هجوم توقيت نظري يستنتج قيمة state حرفًا بحرف من فروق زمن
// المقارنة العادية (===)، رغم أن هذا التطبيق ذو مخاطر منخفضة، هي الممارسة الصحيحة القياسية.
function safeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const settingsUrl = new URL("/admin/settings", url.origin);
  settingsUrl.searchParams.set("tab", "messaging");

  try {
    await requireAdmin();
  } catch (error) {
    // أي خطأ آخر غير UnauthorizedError (مثلًا عطل عابر بقاعدة البيانات أثناء التحقق من
    // الجلسة) كان يُرمى بلا معالجة هنا فيظهر صفحة خطأ عامة بدل إعادة توجيه متسقة مع بقية
    // مسارات هذا الملف — لا يمكن إثبات صلاحية المدير فنعامله كغير مسجَّل دخول بأمان.
    if (!(error instanceof UnauthorizedError)) {
      console.error("gmail oauth callback: requireAdmin failed unexpectedly", error);
    }
    return NextResponse.redirect(new URL("/admin/login", url.origin));
  }

  // الكوكي أحادية الاستعمال — تُحذف بغض النظر عن نتيجة المطابقة، فمحاولة إعادة استعمال
  // نفس رابط الـcallback (سواء من المدير نفسه أو من مهاجم يعيد تشغيله لاحقًا) تفشل دائمًا.
  const cookieStore = await cookies();
  const expectedState = cookieStore.get(OAUTH_STATE_COOKIE)?.value;
  cookieStore.delete(OAUTH_STATE_COOKIE);

  const code = url.searchParams.get("code");
  const oauthError = url.searchParams.get("error");
  const returnedState = url.searchParams.get("state");

  if (oauthError) {
    settingsUrl.searchParams.set("email_error", oauthError);
    return NextResponse.redirect(settingsUrl);
  }

  // حماية CSRF: state المُرجَع من Google يجب أن يطابق حرفيًا القيمة العشوائية التي وُلِّدت
  // فبداية هذا التدفق تحديدًا (راجع connect/route.ts) — منع ربط كود OAuth خاص بمهاجم
  // بحساب Gmail المتجر عبر خداع مدير مسجَّل الدخول للنقر على رابط callback جاهز.
  if (!expectedState || !returnedState || !safeEqualStrings(returnedState, expectedState)) {
    console.error("gmail oauth callback: state mismatch or missing");
    settingsUrl.searchParams.set("email_error", "invalid_state");
    return NextResponse.redirect(settingsUrl);
  }

  if (!code) {
    settingsUrl.searchParams.set("email_error", "missing_code");
    return NextResponse.redirect(settingsUrl);
  }

  try {
    await handleGmailCallback(url.origin, code);
    settingsUrl.searchParams.set("email_connected", "gmail");
  } catch (error) {
    console.error("gmail oauth callback error", error);
    settingsUrl.searchParams.set("email_error", "exchange_failed");
  }

  return NextResponse.redirect(settingsUrl);
}
