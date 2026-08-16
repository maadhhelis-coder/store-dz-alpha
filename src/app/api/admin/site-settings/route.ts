import { NextResponse } from "next/server";
import { requireAdmin, requireOwner, ForbiddenError, UnauthorizedError } from "@/lib/auth/requireAdmin";
import { siteSettingsUpdateSchema } from "@/lib/validation/siteSettingsSchema";
import { getSiteSettings, updateSiteSettings } from "@/server/services/siteSettingsService";

// لا تُرسل توكنات Meta/TikTok الفعلية للمتصفح أبدًا (كانت تُرسل نصًا صريحًا لتعبئة نماذج
// التتبّع/المزامنة) — فقط إشارة أنها محفوظة، لنفس أسباب الأمان وتفادي إعادة التشفير عند
// إعادة إرسالها بلا تغيير (راجع courierIntegrationsService/emailIntegrationsService).
function maskAdTokens<T extends Record<string, unknown>>(settings: T) {
  const {
    metaCapiAccessToken,
    tiktokEventsApiAccessToken,
    metaAdsInsightsAccessToken,
    tiktokAdsReportAccessToken,
    ...rest
  } = settings;
  return {
    ...rest,
    hasMetaCapiAccessToken: !!metaCapiAccessToken,
    hasTiktokEventsApiAccessToken: !!tiktokEventsApiAccessToken,
    hasMetaAdsInsightsAccessToken: !!metaAdsInsightsAccessToken,
    hasTiktokAdsReportAccessToken: !!tiktokAdsReportAccessToken,
  };
}

export async function GET() {
  try {
    await requireAdmin();
    const settings = await getSiteSettings();
    return NextResponse.json({ settings: maskAdTokens(settings) });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("get site settings error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await requireOwner();
    const body = await request.json().catch(() => null);
    const parsed = siteSettingsUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "بيانات غير صحيحة", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const settings = await updateSiteSettings(parsed.data);
    return NextResponse.json({ settings: maskAdTokens(settings) });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("update site settings error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}
