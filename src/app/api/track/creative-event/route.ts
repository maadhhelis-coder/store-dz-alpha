import { NextResponse } from "next/server";
import { trackingEventSchema } from "@/lib/validation/trackingEventSchema";
import { recordTrackingEvent } from "@/server/repositories/trackingEventsRepository";
import { checkTrackRateLimit } from "@/server/services/rateLimitService";
import { getClientIp } from "@/lib/getClientIp";

// نقطة تتبّع عامة بلا مصادقة — نفس نمط /api/track/pageview: نسجّل الحدث بصمت في الخلفية
// ونرجّع 200 دائمًا حتى لا نكسر تجربة الزبون لو فشل التتبّع.
export async function POST(request: Request) {
  try {
    const rateLimit = await checkTrackRateLimit(getClientIp(request));
    if (!rateLimit.allowed) {
      return NextResponse.json({ ok: true });
    }
    const body = await request.json().catch(() => null);
    const parsed = trackingEventSchema.safeParse(body);
    if (parsed.success) {
      await recordTrackingEvent(parsed.data);
    }
  } catch (error) {
    console.error("record creative tracking event error", error);
  }
  return NextResponse.json({ ok: true });
}
