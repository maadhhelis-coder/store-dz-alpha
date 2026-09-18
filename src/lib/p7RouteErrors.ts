import { NextResponse } from "next/server";
import { UnauthorizedError, ForbiddenError } from "@/lib/auth/requireAdmin";
import { CommunicationError, COMMUNICATION_ERROR_STATUS } from "@/server/modules/communications/communicationService";
import { AutomationError } from "@/server/modules/automation/automationService";

// ترجمة أخطاء P7 إلى HTTP — نفس نمط p6RouteErrors.
export function p7ErrorResponse(error: unknown, label: string): NextResponse {
  if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
  if (error instanceof ForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
  if (error instanceof CommunicationError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: COMMUNICATION_ERROR_STATUS[error.code] });
  }
  if (error instanceof AutomationError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.code === "NOT_FOUND" ? 404 : 409 });
  }
  console.error(`${label} route error`, error);
  return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
}
