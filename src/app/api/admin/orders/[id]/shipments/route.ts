import { NextResponse } from "next/server";
import { z } from "zod";
import { UnauthorizedError, ForbiddenError } from "@/lib/auth/requireAdmin";
import { requirePermission } from "@/lib/auth/requirePermission";
import { prisma } from "@/server/db/prisma";
import { upsertCourierCommuneMapping } from "@/server/repositories/courierCommuneMappingRepository";
import { InvalidTransitionError } from "@/server/modules/orders/stateMachine";
import {
  createShipment,
  getShipmentsForOrder,
  ShipmentError,
  SHIPMENT_ERROR_STATUS,
} from "@/server/modules/shipping/shipmentService";

// شحنات الطلب — القراءة بـshipments.read والإنشاء بـshipments.create.
//
// POST يكتب النية محليًا فقط (شحنة + أسطرها + حدث outbox) ويعود فورًا: لا
// نداء ناقل داخل الطلب. رقم التتبّع يظهر بعد أن يصرّف المشغّل الحدث — لذلك
// الرد 202 لا 200، وحالة الشحنة "created" حتى ينجح الإرسال.

const paramsSchema = z.object({ id: z.string().uuid() });
const bodySchema = z.object({
  provider: z.string().trim().min(1).max(50).optional(),
  reason: z.string().trim().max(500).optional(),
  /** تصحيح اسم البلدية عند الناقل قبل الإرسال — يُحفَظ فيُستعمَل تلقائيًا لاحقًا
   * لنفس (ولاية، بلدية). كان في المسار القديم؛ بقي لأن رفض البلدية هو سبب
   * الرفض الأول عمليًا، وبدونه لا سبيل لتصحيحه وإعادة المحاولة. */
  communeOverride: z.string().trim().min(1).max(120).optional(),
});

function fail(error: unknown) {
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
    return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
  }
  console.error("order shipments route error", error);
  return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("shipments.read");
    const parsed = paramsSchema.safeParse(await context.params);
    if (!parsed.success) {
      return NextResponse.json({ error: "معرّف طلب غير صحيح" }, { status: 400 });
    }
    return NextResponse.json({ shipments: await getShipmentsForOrder(parsed.data.id) });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requirePermission("shipments.create");

    const parsedParams = paramsSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      return NextResponse.json({ error: "معرّف طلب غير صحيح" }, { status: 400 });
    }
    const parsed = bodySchema.safeParse((await request.json().catch(() => null)) ?? {});
    if (!parsed.success) {
      return NextResponse.json(
        { error: "بيانات غير صحيحة", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    if (parsed.data.communeOverride) {
      const order = await prisma.order.findUnique({
        where: { id: parsedParams.data.id },
        select: { wilayaCode: true, commune: true },
      });
      if (order) {
        await upsertCourierCommuneMapping(
          parsed.data.provider ?? "DHD",
          order.wilayaCode,
          order.commune,
          parsed.data.communeOverride,
        );
      }
    }

    const shipment = await createShipment({
      orderId: parsedParams.data.id,
      actor: { type: "admin", id: admin.id },
      provider: parsed.data.provider,
      reason: parsed.data.reason ?? null,
    });

    return NextResponse.json({ shipment }, { status: 202 });
  } catch (error) {
    return fail(error);
  }
}
