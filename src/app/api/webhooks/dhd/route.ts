import { NextResponse } from "next/server";
import { processDhdWebhookPayload } from "@/server/services/dhdService";
import { verifyDhdWebhookSignature } from "@/lib/auth/verifyDhdWebhookSecret";

export const maxDuration = 15;

// يستقبل تحديثات فورية من DHD (منصة EcoTrack) — شكل الحمولة وصيغة التوقيع موثَّقان رسميًا
// الآن (راجع processDhdWebhookPayload وverifyDhdWebhookSignature)، بعد أن كانا تخمينًا.
//
// نقرأ الـbody كنص خام أولًا (request.text() لا request.json()) — التحقق من HMAC يجب أن
// يتم على البايتات الخام تمامًا كما وصلت، لا على نسخة مُعاد تسلسلها بعد JSON.parse (قد
// تختلف بمسافات/ترتيب مفاتيح فتُفشل التوقيع رغم صحته).
//
// توثيق DHD يوصي بالرد بسرعة ("Répondez rapidement... puis traitez en arrière-plan") —
// لكن هذا تحديث سريع لسطر واحد فقط (findFirst + update اختياري)، ومنصة Vercel serverless
// لا تضمن استمرار عمل غير مُنتظَر (fire-and-forget) بعد إرجاع الرد بدون waitUntil (غير
// متوفر هنا)؛ ننتظر النتيجة فعليًا بدل المخاطرة بمعالجة تُقطَع صامتة — أسرع بكثير من
// مهلتهم (30 ثانية) على أي حال.
export async function POST(request: Request) {
  const rawBody = await request.text();

  if (!verifyDhdWebhookSignature(rawBody, request.headers.get("signature"))) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const payload = JSON.parse(rawBody);
  const result = await processDhdWebhookPayload(payload);

  return NextResponse.json({ ok: true, result });
}
