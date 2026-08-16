import { NextResponse } from "next/server";
import { requireAdmin, UnauthorizedError } from "@/lib/auth/requireAdmin";
import { getOrder, updateOrderFields, OrderNotFoundError } from "@/server/services/ordersService";
import { fetchDhdOrderStatus, DhdNotConfiguredError } from "@/server/services/dhdService";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: RouteParams) {
  try {
    await requireAdmin();
    const { id } = await params;
    const order = await getOrder(id);

    if (!order.courierTrackingId) {
      return NextResponse.json({ error: "أدخل رقم تتبع الشحنة أولاً" }, { status: 400 });
    }
    if (order.courierProvider !== "DHD") {
      return NextResponse.json({ error: "شركة التوصيل المحددة لهذا الطلب ليست DHD" }, { status: 400 });
    }

    const result = await fetchDhdOrderStatus(order.courierTrackingId);
    const updated = await updateOrderFields(id, { courierStatus: result.status });
    return NextResponse.json({ order: updated });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof OrderNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof DhdNotConfiguredError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof Error) {
      console.error("refresh courier status error", error);
      return NextResponse.json({ error: "تعذر الاتصال بخدمة التوصيل، حاول لاحقًا" }, { status: 502 });
    }
    console.error("refresh courier status error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}
