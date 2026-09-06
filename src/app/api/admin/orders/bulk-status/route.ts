import { NextResponse } from "next/server";
import { UnauthorizedError, ForbiddenError } from "@/lib/auth/requireAdmin";
import { requirePermission } from "@/lib/auth/requirePermission";
import { orderBulkStatusSchema } from "@/lib/validation/orderSchema";
import { bulkUpdateOrderStatus } from "@/server/services/ordersService";

// راجع نفس التعليق فـsrc/app/api/orders/route.ts — كل طلب فالدفعة يطلق order_status_changed
// عبر نفس مسار إعادة المحاولة (~44 ثانية أقصى)، بالتوازي عبر Promise.all (زمن الدفعة
// الكلي يبقى قريبًا من محاولة واحدة، وليس مجموع كل الطلبات).
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    await requirePermission("orders.status_change");
    const body = await request.json().catch(() => null);
    const parsed = orderBulkStatusSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "بيانات غير صحيحة", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const result = await bulkUpdateOrderStatus(parsed.data.orderIds, parsed.data.status);
    return NextResponse.json({ updated: result.count });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("bulk update order status error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}
