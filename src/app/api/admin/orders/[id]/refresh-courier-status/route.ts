import { NextResponse } from "next/server";
import { z } from "zod";
import { UnauthorizedError, ForbiddenError } from "@/lib/auth/requireAdmin";
import { requirePermission } from "@/lib/auth/requirePermission";
import { DhdNotConfiguredError } from "@/server/services/dhdService";
import { getCarrierAdapter } from "@/server/modules/shipping/carrierAdapter";
import { ingestCarrierEvent } from "@/server/modules/shipping/shipmentEvents";
import { findActiveShipment } from "@/server/modules/shipping/shipmentService";

// تحديث يدوي لحالة الشحنة من الناقل — shipments.update.
//
// لا مسار جانبي: النتيجة تمر من نفس بوابة ingestCarrierEvent التي يمر منها
// الـwebhook (إلغاء تكرار، منع تراجع، آلة الحالات، سجل حدث). زر «تحديث» لا
// يملك صلاحيات أكثر من الناقل نفسه.

const paramsSchema = z.object({ id: z.string().uuid() });

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("shipments.update");

    const parsed = paramsSchema.safeParse(await context.params);
    if (!parsed.success) {
      return NextResponse.json({ error: "معرّف طلب غير صحيح" }, { status: 400 });
    }

    const shipment = await findActiveShipment(parsed.data.id);
    if (!shipment) {
      return NextResponse.json(
        { error: "لا توجد شحنة نشطة لهذا الطلب", code: "NO_ACTIVE_SHIPMENT" },
        { status: 404 },
      );
    }
    if (!shipment.trackingNumber) {
      return NextResponse.json(
        { error: "الشحنة لم تُرسَل للناقل بعد", code: "NOT_DISPATCHED" },
        { status: 409 },
      );
    }

    const adapter = getCarrierAdapter(shipment.provider);
    const { rawStatus } = await adapter.fetchStatus(shipment.trackingNumber);
    if (rawStatus === null) {
      return NextResponse.json({ ok: true, outcome: "no_carrier_data", rawStatus: null });
    }
    const result = await ingestCarrierEvent({
      provider: shipment.provider,
      trackingNumber: shipment.trackingNumber,
      rawStatus,
      description: `تحديث يدوي: ${rawStatus}`,
    });

    return NextResponse.json({ ok: true, outcome: result.outcome, rawStatus });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof DhdNotConfiguredError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("refresh courier status error", error);
    return NextResponse.json({ error: "تعذر الاتصال بخدمة التوصيل، حاول لاحقًا" }, { status: 502 });
  }
}
