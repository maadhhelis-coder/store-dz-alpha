import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/requirePermission";
import { p7ErrorResponse } from "@/lib/p7RouteErrors";
import { automationRetrySchema } from "@/lib/validation/automationSchema";
import { retryDomainEvent } from "@/server/modules/automation/automationService";

const paramsSchema = z.object({ id: z.string().uuid() });

// إعادة تشغيل حدث فاشل يدويًا — automation.retry بسبب إلزامي (موثّق في الخدمة).
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requirePermission("automation.retry");
    const params = paramsSchema.safeParse(await context.params);
    if (!params.success) return NextResponse.json({ error: "معرّف غير صحيح" }, { status: 400 });
    const parsed = automationRetrySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "سبب الإعادة إلزامي" }, { status: 400 });
    return NextResponse.json(await retryDomainEvent(params.data.id, { type: "admin", id: admin.id }, parsed.data.reason));
  } catch (error) {
    return p7ErrorResponse(error, "automation retry");
  }
}
