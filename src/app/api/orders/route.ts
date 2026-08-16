import { NextResponse } from "next/server";
import { orderCreateSchema } from "@/lib/validation/orderSchema";
import { checkOrderRateLimit } from "@/server/services/rateLimitService";
import { getClientIp } from "@/lib/getClientIp";
import { withIdempotency, IdempotencyConflictError, type IdempotentResult } from "@/lib/idempotency";
import {
  createOrder,
  DeliveryOptionUnavailableError,
  InsufficientStockError,
  InvalidCouponError,
  ProductUnavailableError,
  WilayaNotFoundError,
} from "@/server/services/ordersService";

const MAX_IDEMPOTENCY_KEY_LENGTH = 100;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = orderCreateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "بيانات الطلب غير صحيحة", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const orderInput = parsed.data;
  const ip = getClientIp(request);
  const fullName = `${orderInput.firstName} ${orderInput.lastName}`;
  const rateLimit = await checkOrderRateLimit(orderInput.phone, ip, fullName, orderInput.visitorId);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: rateLimit.reason }, { status: 429 });
  }

  // Idempotency-Key اختياري (يولّده العميل مرة واحدة لكل محاولة طلب — راجع OrderModal) —
  // يمنع إنشاء طلبين حقيقيين من نفس المحاولة عند إعادة إرسال حقيقية (انقطاع شبكة والعميل
  // لا يعرف هل نجح الطلب الأول، فيعيد المحاولة بنفس المفتاح).
  const rawIdemKey = request.headers.get("idempotency-key");
  const idempotencyKey =
    rawIdemKey && rawIdemKey.trim().length > 0 && rawIdemKey.length <= MAX_IDEMPOTENCY_KEY_LENGTH
      ? `order:${rawIdemKey.trim()}`
      : null;

  async function process(): Promise<IdempotentResult<Record<string, unknown>>> {
    try {
      const order = await createOrder(orderInput, {
        ipAddress: ip,
        userAgent: request.headers.get("user-agent") ?? undefined,
        deviceFingerprint: orderInput.visitorId,
      });

      return {
        status: 201,
        body: {
          orderNumber: order.orderNumber,
          totalDzd: order.totalDzd,
          deliveryPriceDzd: order.deliveryPriceDzd,
          discountDzd: order.discountDzd,
          couponCode: order.couponCode,
          status: order.status,
          // يعكس ما حصل فعليًا (راجع offerId في ordersService.createOrder) — وليس مجرد
          // ما طلبه العميل؛ الواجهة تعتمد عليه لتقرر هل تعرض منتج العرض فشاشة التأكيد.
          offerIncluded: order.offerId !== null,
        },
      };
    } catch (error) {
      if (error instanceof ProductUnavailableError || error instanceof WilayaNotFoundError) {
        return { status: 404, body: { error: error.message } };
      }
      if (error instanceof InsufficientStockError || error instanceof DeliveryOptionUnavailableError) {
        return { status: 409, body: { error: error.message } };
      }
      if (error instanceof InvalidCouponError) {
        return { status: 400, body: { error: error.message } };
      }
      console.error("order creation error", error);
      return { status: 500, body: { error: "حدث خطأ غير متوقع، حاول من جديد" } };
    }
  }

  try {
    const { status, body: responseBody } = idempotencyKey
      ? await withIdempotency(idempotencyKey, process)
      : await process();
    return NextResponse.json(responseBody, { status });
  } catch (error) {
    if (error instanceof IdempotencyConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("order idempotency error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع، حاول من جديد" }, { status: 500 });
  }
}
