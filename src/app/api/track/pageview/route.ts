import { NextResponse } from "next/server";
import { recordPageView } from "@/server/repositories/pageViewsRepository";
import { checkTrackRateLimit } from "@/server/services/rateLimitService";
import { getClientIp } from "@/lib/getClientIp";

export async function POST(request: Request) {
  try {
    const rateLimit = await checkTrackRateLimit(getClientIp(request));
    if (!rateLimit.allowed) {
      // لا نكشف سبب الرفض ولا نُخرج الزائر عن مساره — نتجاهل الحدث بصمت فقط.
      return NextResponse.json({ ok: true });
    }
    const body = await request.json().catch(() => null);
    const path = typeof body?.path === "string" ? body.path.slice(0, 300) : "/";
    await recordPageView(path);
  } catch (error) {
    console.error("record pageview error", error);
  }
  // نُرجع 200 دائمًا — هذا تتبع خلفي صامت، لا يجب أن يؤثر أبدًا على تجربة الزائر.
  return NextResponse.json({ ok: true });
}
