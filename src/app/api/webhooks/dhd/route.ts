import { NextResponse } from "next/server";
import { processDhdWebhookPayload } from "@/server/services/dhdService";
import { verifyDhdWebhookSecret } from "@/lib/auth/verifyDhdWebhookSecret";

export const maxDuration = 15;

// يستقبل تحديثات فورية من DHD إن وُجد خيار Webhook فلوحة حسابك عندهم — راجع
// processDhdWebhookPayload لملاحظة أن شكل الحمولة الحقيقي غير موثَّق علنًا بعد،
// فنحاول عدة أسماء حقول محتملة ونُسجّل أي حمولة غير متعرَّف عليها كاملةً للمراجعة.
//
// يُرجع 200 دائمًا بعد نجاح التحقق من السر (حتى لو لم نجد الطلب المطابق) — نفس اتفاقية
// أغلب منصات الـwebhook (رد غير 200 متكرر يجعلها تُعيد المحاولة أو تُعطّل الرابط تلقائيًا)؛
// أي خلل حقيقي يُسجَّل فـconsole بدل أن يظهر كفشل HTTP لـDHD.
export async function POST(request: Request) {
  if (!verifyDhdWebhookSecret(request)) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const result = await processDhdWebhookPayload(payload);

  return NextResponse.json({ ok: true, result });
}
