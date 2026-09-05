import { NextResponse } from "next/server";
import { z } from "zod";
import { UnauthorizedError, ForbiddenError } from "@/lib/auth/requireAdmin";
import { requirePermission } from "@/lib/auth/requirePermission";
import { listFraudSignals } from "@/server/modules/fraud/fraudQueries";

// قائمة إشارات الاحتيال — risk.read. الترقيم من الخادم بسقف صارم والترتيب حتمي.

const querySchema = z.object({
  status: z.enum(["open", "reviewed", "dismissed"]).optional(),
  severity: z.enum(["low", "medium", "high"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export async function GET(request: Request) {
  try {
    await requirePermission("risk.read");
    const url = new URL(request.url);
    const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "بيانات غير صحيحة", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    return NextResponse.json(await listFraudSignals(parsed.data));
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
    console.error("fraud signals list error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}
