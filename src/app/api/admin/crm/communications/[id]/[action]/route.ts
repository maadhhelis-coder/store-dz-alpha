import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/requirePermission";
import { p7ErrorResponse } from "@/lib/p7RouteErrors";
import { communicationActionSchema } from "@/lib/validation/automationSchema";
import {
  cancelCommunication,
  markCommunicationSent,
  retryCommunication,
} from "@/server/modules/communications/communicationService";

const paramsSchema = z.object({ id: z.string().uuid(), action: z.enum(["retry", "cancel", "mark-sent"]) });

// إجراءات بشرية على رسالة — communications.send، كلها موثّقة في الخدمة.
export async function POST(request: Request, context: { params: Promise<{ id: string; action: string }> }) {
  try {
    const admin = await requirePermission("communications.send");
    const params = paramsSchema.safeParse(await context.params);
    if (!params.success) return NextResponse.json({ error: "معرّف أو إجراء غير صحيح" }, { status: 400 });
    const parsed = communicationActionSchema.safeParse((await request.json().catch(() => ({}))) ?? {});
    if (!parsed.success) return NextResponse.json({ error: "بيانات غير صحيحة" }, { status: 400 });
    const actor = { type: "admin" as const, id: admin.id };
    const reason = parsed.data.reason ?? "إجراء يدوي";
    const { id, action } = params.data;
    const result =
      action === "retry"
        ? await retryCommunication(id, actor, reason)
        : action === "cancel"
          ? await cancelCommunication(id, actor, reason)
          : await markCommunicationSent(id, actor);
    return NextResponse.json(result);
  } catch (error) {
    return p7ErrorResponse(error, "communication action");
  }
}
