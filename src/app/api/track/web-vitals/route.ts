import { NextResponse } from "next/server";
import { webVitalSchema } from "@/lib/validation/webVitalSchema";
import { recordWebVital } from "@/server/repositories/webVitalsRepository";
import { checkTrackRateLimit } from "@/server/services/rateLimitService";
import { getClientIp } from "@/lib/getClientIp";

// نقطة تتبّع عامة بلا مصادقة — نفس نمط /api/track/pageview وcreative-event: نسجّل المقياس
// بصمت فالخلفية ونرجّع 200 دائمًا حتى لا نكسر تجربة الزبون لو فشل التتبّع.
export async function POST(request: Request) {
  try {
    const rateLimit = await checkTrackRateLimit(getClientIp(request));
    if (!rateLimit.allowed) {
      return NextResponse.json({ ok: true });
    }
    const body = await request.json().catch(() => null);
    const parsed = webVitalSchema.safeParse(body);
    if (parsed.success) {
      await recordWebVital(parsed.data);
    }
  } catch (error) {
    console.error("record web vital error", error);
  }
  return NextResponse.json({ ok: true });
}
