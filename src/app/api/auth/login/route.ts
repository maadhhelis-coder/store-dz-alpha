import { NextResponse } from "next/server";
import { loginSchema } from "@/lib/validation/authSchema";
import { loginAdmin, InvalidCredentialsError } from "@/server/services/authService";
import { checkLoginRateLimit } from "@/server/services/rateLimitService";
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
    console.error("login error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}
