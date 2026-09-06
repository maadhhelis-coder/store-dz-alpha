import { NextResponse } from "next/server";
import { verifyDhdWebhookSignature } from "@/lib/auth/verifyDhdWebhookSecret";
import { ingestCarrierEvent } from "@/server/modules/shipping/shipmentEvents";

export const maxDuration = 15;

// تحديثات DHD (منصة EcoTrack). التوقيع HMAC-SHA256 على الجسم الخام كما وصل
// (request.text قبل أي JSON.parse) — لا يتغيّر.
//
// ما تغيّر في P5: الحدث لم يعد يكتب حقلًا نصيًا على الطلب، بل يمر عبر بوابة
// أحداث الشحنة: إلغاء تكرار في القاعدة أولًا، ثم ترجمة الحالة، ثم منع التراجع،
// ثم آلة الحالات. التسليم at-least-once والمعالجة effectively-once.
//
// شكل الحمولة الموثّق: event="order.{action}"، data.{tracking, reference,
// state:{id, code, title}}. لا معرّف حدث فريد فيها، فبصمة المحتوى هي البوابة.
// نرد 200 دائمًا بعد التحقق من التوقيع — إعادة الإرسال بلا طائل، والنتيجة
// موثّقة في shipment_events أو في تنبيه نظام.

export async function POST(request: Request) {
  const rawBody = await request.text();

  if (!verifyDhdWebhookSignature(rawBody, request.headers.get("signature"))) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "حمولة غير صالحة" }, { status: 400 });
  }

  const body = payload as {
    data?: { tracking?: string; reference?: string; state?: { title?: string; code?: string } };
  } | null;

  const tracking = body?.data?.tracking ?? null;
  const reference = body?.data?.reference ?? null;
  const rawStatus = body?.data?.state?.title;

  if (!rawStatus || (!tracking && !reference)) {
    console.error("dhd webhook: unexpected payload shape", JSON.stringify(payload).slice(0, 500));
    return NextResponse.json({ ok: false, outcome: "invalid_payload" }, { status: 400 });
  }

  const result = await ingestCarrierEvent({
    provider: "DHD",
    trackingNumber: tracking,
    reference,
    rawStatus,
    description: body?.data?.state?.code ?? null,
    rawPayload: payload,
  });

  return NextResponse.json({ ok: true, outcome: result.outcome });
}
