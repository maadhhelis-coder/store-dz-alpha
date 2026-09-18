import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/requirePermission";
import { p7ErrorResponse } from "@/lib/p7RouteErrors";
import { communicationsListQuerySchema, sendCommunicationSchema } from "@/lib/validation/automationSchema";
import {
  dispatchCommunication,
  listCommunications,
  queueCommunication,
} from "@/server/modules/communications/communicationService";

// التواصل — القراءة communications.read؛ الإرسال اليدوي communications.send.
// الإرسال لا يلمس المزوّد هنا: الخدمة تُدرج ثم تُرسل عبر تجريد المزوّد.

export async function GET(request: Request) {
  try {
    await requirePermission("communications.read");
    const parsed = communicationsListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) return NextResponse.json({ error: "بيانات غير صحيحة", details: parsed.error.flatten() }, { status: 400 });
    return NextResponse.json(await listCommunications(parsed.data));
  } catch (error) {
    return p7ErrorResponse(error, "communications list");
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requirePermission("communications.send");
    const parsed = sendCommunicationSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "بيانات غير صحيحة", details: parsed.error.flatten() }, { status: 400 });
    if (parsed.data.template === "custom" && !parsed.data.body) {
      return NextResponse.json({ error: "نص الرسالة إلزامي للقالب الحر" }, { status: 400 });
    }
    const channel = parsed.data.provider === "sms" ? "sms" : parsed.data.provider === "gmail" ? "email" : "whatsapp";
    const { communication } = await queueCommunication({
      orderId: parsed.data.orderId,
      channel,
      provider: parsed.data.provider,
      template: parsed.data.template,
      variables: parsed.data.body ? { body: parsed.data.body } : {},
      actor: { type: "admin", id: admin.id },
      correlationId: request.headers.get("x-request-id"),
    });
    const result = await dispatchCommunication(communication.id);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return p7ErrorResponse(error, "communication send");
  }
}
