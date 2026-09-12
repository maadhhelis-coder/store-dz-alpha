import { NextResponse } from "next/server";
import { loginSchema } from "@/lib/validation/authSchema";
import { loginAdmin, InvalidCredentialsError, AuthUnavailableError } from "@/server/services/authService";
import { checkLoginRateLimit } from "@/server/services/rateLimitService";
import { raiseSystemAlertOnce } from "@/server/modules/alerts/alertsService";
import { getClientIp } from "@/lib/getClientIp";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "بيانات الدخول غير صحيحة", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const rateLimit = await checkLoginRateLimit(getClientIp(request), parsed.data.email);
  if (!rateLimit.allowed) {
    // «محاولات تسجيل دخول مشبوهة» فتبويب الإشعارات — تنبيه واحد مفتوح لكل بريد
    // مستهدف (لا واحد لكل محاولة)، ولا ينتظره الرد ولا يرمي.
    void raiseSystemAlertOnce({
      type: "login_rate_limited",
      severity: "high",
      entityType: "admin_login",
      entityId: parsed.data.email.trim().toLowerCase(),
      message: `محاولات دخول كثيرة فاشلة على حساب ${parsed.data.email.trim().toLowerCase()} — تم حظرها مؤقتًا`,
    });
    return NextResponse.json({ error: rateLimit.reason }, { status: 429 });
  }

  try {
    const admin = await loginAdmin(parsed.data);
    return NextResponse.json({
      user: { id: admin.id, email: admin.email, fullName: admin.fullName, role: admin.role },
    });
  } catch (error) {
    if (error instanceof InvalidCredentialsError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof AuthUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error("login error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}
