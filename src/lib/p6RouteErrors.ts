import { NextResponse } from "next/server";
import { UnauthorizedError, ForbiddenError } from "@/lib/auth/requireAdmin";
import { ReturnError, RETURN_ERROR_STATUS } from "@/server/modules/returns/returnsService";
import { SettlementError, SETTLEMENT_ERROR_STATUS } from "@/server/modules/finance/codSettlementService";
import { AdjustmentError, ADJUSTMENT_ERROR_STATUS } from "@/server/modules/finance/financialAdjustmentsService";
import { InvalidTransitionError } from "@/server/modules/orders/stateMachine";
import { InsufficientStockError } from "@/server/modules/orders/statusService";

// ترجمة أخطاء P6 إلى HTTP — مشتركة بين مسارات المرتجعات والمالية (نفس نمط
// SHIPMENT_ERROR_STATUS في P5): الأخطاء المعروفة برمزها، وغيرها 500 بلا تسريب.
export function p6ErrorResponse(error: unknown, label: string): NextResponse {
  if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
  if (error instanceof ForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
  if (error instanceof ReturnError) {
    return NextResponse.json(
      { error: error.message, code: error.code, returnId: error.returnId },
      { status: RETURN_ERROR_STATUS[error.code] },
    );
  }
  if (error instanceof SettlementError) {
    return NextResponse.json(
      { error: error.message, code: error.code, settlementId: error.settlementId },
      { status: SETTLEMENT_ERROR_STATUS[error.code] },
    );
  }
  if (error instanceof AdjustmentError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: ADJUSTMENT_ERROR_STATUS[error.code] });
  }
  if (error instanceof InvalidTransitionError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
  }
  if (error instanceof InsufficientStockError) {
    return NextResponse.json({ error: error.message, code: "INSUFFICIENT_STOCK" }, { status: 409 });
  }
  console.error(`${label} route error`, error);
  return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
}

export function invalidBody(details: unknown): NextResponse {
  return NextResponse.json({ error: "بيانات غير صحيحة", details }, { status: 400 });
}
