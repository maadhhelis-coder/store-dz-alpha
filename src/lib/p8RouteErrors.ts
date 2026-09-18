import { NextResponse } from "next/server";
import { UnauthorizedError, ForbiddenError } from "@/lib/auth/requireAdmin";
import { SupabaseConfigError } from "@/lib/supabaseAdminClient";
import { TeamRuleError, TeamMemberExistsError, TeamMemberNotFoundError } from "@/server/modules/team/teamService";
import { ExportTooLargeError } from "@/server/modules/exports/exportsService";

// ترجمة أخطاء P8 إلى HTTP — نفس نمط p6/p7RouteErrors.
export function p8ErrorResponse(error: unknown, label: string): NextResponse {
  if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
  if (error instanceof ForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
  if (error instanceof TeamRuleError) return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
  if (error instanceof TeamMemberExistsError) return NextResponse.json({ error: error.message, code: "EXISTS" }, { status: 409 });
  if (error instanceof TeamMemberNotFoundError) return NextResponse.json({ error: error.message, code: "NOT_FOUND" }, { status: 404 });
  if (error instanceof ExportTooLargeError) {
    return NextResponse.json({ error: error.message, code: "TOO_LARGE", rows: error.rows, limit: error.limit }, { status: 413 });
  }
  // غياب SUPABASE_SERVICE_ROLE_KEY: حالة إعداد صريحة لا عطل — «غير متاح — يحتاج إلى إعداد»
  if (error instanceof SupabaseConfigError) return NextResponse.json({ error: "غير متاح — يحتاج إلى إعداد", code: "NOT_CONFIGURED" }, { status: 503 });
  console.error(`${label} route error`, error);
  return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
}
