import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireOwner, ForbiddenError, UnauthorizedError } from "@/lib/auth/requireAdmin";
import { emailProviderParamSchema } from "@/lib/validation/emailIntegrationSchema";
import {
  buildAuthorizeUrl,
  IntegrationNotConfiguredError,
  IntegrationNotSupportedError,
} from "@/server/services/emailIntegrationsService";

export const OAUTH_STATE_COOKIE = "email_oauth_state";

export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  try {
    await requireOwner();
    const { provider } = await params;
    const parsedProvider = emailProviderParamSchema.safeParse(provider);
    if (!parsedProvider.success) {
      return NextResponse.json({ error: "مزوّد غير معروف" }, { status: 400 });
    }

    const origin = new URL(request.url).origin;
    // state عشوائي (256-bit) لكل محاولة ربط — يُخزَّن فكوكي httpOnly قصيرة العمر ويُتحقَّق
    // من تطابقه فالـcallback قبل تبادل الكود، لمنع OAuth Login CSRF (ربط حساب Gmail
    // مهاجم بدل حساب المدير الفعلي عبر خداعه للنقر على رابط callback بكود جاهز).
    const state = randomBytes(32).toString("base64url");
    const authorizeUrl = await buildAuthorizeUrl(origin, parsedProvider.data, state);

    const cookieStore = await cookies();
    cookieStore.set(OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600, // 10 دقائق — كافية لإتمام تدفق OAuth، قصيرة كفاية لتقليل نافذة أي إساءة استخدام
      path: "/",
    });

    return NextResponse.redirect(authorizeUrl);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof IntegrationNotConfiguredError || error instanceof IntegrationNotSupportedError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("connect email integration error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}
