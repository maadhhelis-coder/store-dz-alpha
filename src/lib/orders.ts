import type { DeliveryOption } from "@/data/delivery";
import { formatPrice } from "@/lib/format";

export type OrderPayload = {
  firstName: string;
  lastName: string;
  phone: string;
  wilayaCode: number;
  wilayaName: string;
  commune: string;
  address?: string;
  deliveryOption: DeliveryOption;
  productName: string;
  productSlug: string;
  variantLabel?: string;
  quantity: number;
  productPrice: number; // سعر الوحدة × الكمية
  deliveryPrice: number;
  totalPrice: number;
  createdAt: string;
  offerProductName?: string;
  offerPriceDzd?: number;
  couponCode?: string;
  discountDzd?: number;
};

// رابط تطبيق Google Apps Script (Web App) الذي يستقبل الطلبات ويسجلها في Google Sheets.
// اتركه فارغًا إلى حين إعداد الشيت (راجع GOOGLE_SHEETS_SETUP.md)، والموقع سيستعمل واتساب كحل احتياطي تلقائيًا.
const ORDER_ENDPOINT = process.env.NEXT_PUBLIC_ORDER_ENDPOINT ?? "";

export function isOrderEndpointConfigured(): boolean {
  return ORDER_ENDPOINT.trim().length > 0;
}

export async function submitOrderToSheet(order: OrderPayload): Promise<boolean> {
  if (!isOrderEndpointConfigured()) return false;

  try {
    await fetch(ORDER_ENDPOINT, {
      method: "POST",
      mode: "no-cors", // Apps Script Web Apps لا يعيدون رؤوس CORS، لذلك لا يمكن قراءة الرد
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(order),
    });
    // mode:"no-cors" يمنعنا من قراءة نجاح/فشل الطلب فعليًا، لذلك نعتبره ناجحًا تفاؤليًا
    return true;
  } catch {
    return false;
  }
}

export type ApiOrderRequest = {
  firstName: string;
  lastName: string;
  phone: string;
  wilayaCode: number;
  commune: string;
  address?: string;
  deliveryOption: DeliveryOption;
  productSlug: string;
  variantId?: string;
  quantity: number;
  offerId?: string;
  couponCode?: string;
  platform?: "facebook" | "instagram" | "tiktok";
  creativeName?: string;
  visitorId?: string;
};

export type ApiOrderResponse = {
  orderNumber: string;
  totalDzd: number;
  deliveryPriceDzd: number;
  discountDzd?: number;
  couponCode?: string | null;
  status: string;
  offerIncluded: boolean;
};

export class OrderApiError extends Error {}

// المسار الرئيسي للطلب: يرسل للـ API الخاص بالموقع (قاعدة بيانات حقيقية + تحقق من المخزون + rate limiting).
// السيرفر هو المصدر الموثوق للأسعار — الرد يحتوي السعر النهائي الصحيح.
//
// idempotencyKey (اختياري): يُمرَّر من OrderModal (مفتاح ثابت لكل محاولة طلب) كي يتعرّف
// السيرفر على إعادة إرسال حقيقية لنفس المحاولة (انقطاع شبكة، إعادة محاولة يدوية بعد فشل)
// ويُعيد نفس نتيجة الطلب الأصلي بدل خلق طلب مكرَّر — راجع src/lib/idempotency.ts.
export async function submitOrderToApi(
  input: ApiOrderRequest,
  idempotencyKey?: string,
): Promise<ApiOrderResponse> {
  const res = await fetch("/api/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify(input),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new OrderApiError(data.error ?? "تعذر إرسال الطلب، حاول من جديد");
  }

  return data as ApiOrderResponse;
}

export type LeadCaptureInput = {
  firstName?: string;
  lastName?: string;
  phone?: string;
  wilayaCode?: number;
  commune?: string;
  address?: string;
  productSlug?: string;
  productName?: string;
};

// التقاط "عميل محتمل" — يُستعمل كي الزائر يسيب الاستمارة بلا ما يكمل الطلب.
// عملية بلا انتظار (fire-and-forget)، ما تأثرش على تجربة المستخدم أبدًا مهما صار.
export function captureAbandonedLead(input: LeadCaptureInput): void {
  const hasSomeInfo = Boolean(input.phone || input.firstName || input.lastName);
  if (!hasSomeInfo) return;

  try {
    void fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      keepalive: true,
    });
  } catch {
    // تجاهل تام — هذا التقاط اختياري بحت
  }
}

export function buildOrderSummaryText(order: OrderPayload): string {
  const deliveryLabel = order.deliveryOption === "office" ? "توصيل للمكتب" : "توصيل للمنزل";
  return [
    `طلب جديد من موقع Store DZ:`,
    `المنتج: ${order.productName}`,
    `الكمية: ${order.quantity}`,
    ...(order.offerProductName
      ? [`+ عرض إضافي: ${order.offerProductName} (${formatPrice(order.offerPriceDzd ?? 0)})`]
      : []),
    `الاسم: ${order.firstName} ${order.lastName}`,
    `الهاتف: ${order.phone}`,
    `الولاية: ${order.wilayaName}`,
    `البلدية: ${order.commune}`,
    ...(order.address ? [`العنوان: ${order.address}`] : []),
    `نوع التوصيل: ${deliveryLabel}`,
    `سعر المنتج: ${formatPrice(order.productPrice)}`,
    `سعر التوصيل: ${formatPrice(order.deliveryPrice)}`,
    ...(order.discountDzd ? [`الخصم (${order.couponCode}): -${formatPrice(order.discountDzd)}`] : []),
    `المجموع: ${formatPrice(order.totalPrice)}`,
  ].join("\n");
}
