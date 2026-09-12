import { NextResponse } from "next/server";
import { z } from "zod";
import { UnauthorizedError, ForbiddenError } from "@/lib/auth/requireAdmin";
import { requireAdminOrApiKey } from "@/lib/auth/requireAdminOrApiKey";
import {
  updateOrderDelivery,
  OrderNotFoundError,
  OrderNotPendingError,
  WilayaNotFoundError,
  DeliveryOptionUnavailableError,
} from "@/server/services/ordersService";

// يستعمله الوكيل الذكي (مفتاح orders:write) عندما يغيّر الزبون طريقة التوصيل قبل
// التأكيد — بلديته بلا مكتب DHD فاختار مكتبًا في بلدية أخرى أو التوصيل للمنزل.
const deliveryUpdateSchema = z.object({
  deliveryOption: z.enum(["home", "office"]),
  commune: z.string().trim().min(1).max(120).optional(),
  address: z.string().trim().min(1).max(300).optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    await requireAdminOrApiKey(request, "orders:write");
    const { id } = await params;
    const parsed = deliveryUpdateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "بيانات غير صحيحة", details: parsed.error.flatten() }, { status: 400 });
    }
    const order = await updateOrderDelivery(id, parsed.data);
    return NextResponse.json({ order });
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof OrderNotFoundError || error instanceof WilayaNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof OrderNotPendingError || error instanceof DeliveryOptionUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("update order delivery error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}
