import { NextResponse } from "next/server";
import { z } from "zod";
import { UnauthorizedError, ForbiddenError } from "@/lib/auth/requireAdmin";
import { requirePermission } from "@/lib/auth/requirePermission";
import { InvalidTransitionError } from "@/server/modules/orders/stateMachine";
import {
  reshipOrder,
  ShipmentError,
  SHIPMENT_ERROR_STATUS,
} from "@/server/modules/shipping/shipmentService";

// إعادة الشحن — shipments.reship حصرًا، بسبب إلزامي.
//
// لا تُنشئ شحنة: تُعيد الطلب المرتجع إلى الدورة (returned→confirmed، الاستثناء
// الوحيد الموثّق في آلة الحالات)، فتُنشأ الشحنة التالية بالمسار العادي وتخضع
// لقاعدة الشحنة النشطة الواحدة كما هي. سباق طلبَي إعادة ينتهي بفائز واحد
// (CAS داخل transitionOrderStatus) والخاسر يرى 409.

const paramsSchema = z.object({ id: z.string().uuid() });
const bodySchema = z.object({ reason: z.string().trim().min(1).max(500) });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requirePermission("shipments.reship");

    const parsedParams = paramsSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      return NextResponse.json({ error: "معرّف طلب غير صحيح" }, { status: 400 });
    }
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "سبب إعادة الشحن إلزامي", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const order = await reshipOrder({
      orderId: parsedParams.data.id,
      actor: { type: "admin", id: admin.id },
      reason: parsed.data.reason,
    });

    return NextResponse.json({ ok: true, orderId: order.id, status: order.status });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof ShipmentError) {
      return NextResponse.json(
        { error: error.message, code: error.code, shipmentId: error.shipmentId },
        { status: SHIPMENT_ERROR_STATUS[error.code] },
      );
    }
    if (error instanceof InvalidTransitionError) {
      return NextResponse.json(
        { error: "لا يمكن إعادة شحن هذا الطلب في حالته الحالية", code: error.code },
        { status: 409 },
      );
    }
    console.error("order reship route error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}
