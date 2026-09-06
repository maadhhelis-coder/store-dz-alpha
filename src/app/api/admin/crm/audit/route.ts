import { NextResponse } from "next/server";
import { z } from "zod";
import { UnauthorizedError, ForbiddenError } from "@/lib/auth/requireAdmin";
import { requirePermission } from "@/lib/auth/requirePermission";
import { listAuditLogs } from "@/server/services/auditService";

// قراءة السجل التدقيقي — audit.read. السجل إلحاقي فقط (لا API للتعديل أو
// الحذف إطلاقًا)، وكان يُكتب في كل مكان بلا أي قارئ: صلاحية audit.read معلنة
// ولا تُفرض في أي مسار. القيم before/after مُنقّحة وقت الكتابة (redactForAudit)
// فالقراءة لا تكشف أسرارًا.

const querySchema = z.object({
  entityType: z.string().trim().max(100).optional(),
  entityId: z.string().trim().max(200).optional(),
  actorId: z.string().uuid().optional(),
  action: z.string().trim().max(100).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export async function GET(request: Request) {
  try {
    await requirePermission("audit.read");

    const url = new URL(request.url);
    const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "بيانات غير صحيحة", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const result = await listAuditLogs(parsed.data);
    return NextResponse.json({
      ...result,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      totalPages: Math.max(1, Math.ceil(result.total / parsed.data.pageSize)),
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("list audit logs error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}
