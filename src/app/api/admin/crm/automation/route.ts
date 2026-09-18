import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/requirePermission";
import { p7ErrorResponse } from "@/lib/p7RouteErrors";
import { automationListQuerySchema } from "@/lib/validation/automationSchema";
import { listDomainEvents } from "@/server/modules/automation/automationService";
import { outboxHealth } from "@/server/modules/automation/outboxDrainer";
import { lastSheetsSyncLogs, sheetsEndpoint } from "@/server/modules/integrations/sheetsSync";

// مراقبة صندوق الأحداث والتكاملات — automation.read.
export async function GET(request: Request) {
  try {
    await requirePermission("automation.read");
    const parsed = automationListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) return NextResponse.json({ error: "بيانات غير صحيحة", details: parsed.error.flatten() }, { status: 400 });
    const [events, health, sheets] = await Promise.all([listDomainEvents(parsed.data), outboxHealth(), lastSheetsSyncLogs(5)]);
    return NextResponse.json({ ...events, health, sheets: { configured: Boolean(sheetsEndpoint()), recent: sheets } });
  } catch (error) {
    return p7ErrorResponse(error, "automation list");
  }
}
