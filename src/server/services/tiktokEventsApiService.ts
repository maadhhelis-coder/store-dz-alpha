import { createHash } from "crypto";
import { getSiteSettings } from "@/server/services/siteSettingsService";
import { decryptSecret } from "@/lib/crypto/secretBox";
import { isE2ETestRun, logE2ESkip } from "@/lib/e2eGuard";

function sha256(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

// تيك توك يتوقّع رقم الهاتف بصيغة دولية كاملة (+213...) قبل التجزئة (Hash).
function normalizePhoneForTikTok(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const withoutLeadingZero = digits.startsWith("0") ? digits.slice(1) : digits;
  return `+213${withoutLeadingZero}`;
}

export type TikTokEventOrderContext = {
  orderNumber: string;
  totalDzd: number;
  phone: string;
};

// ترسل حدث تحويل لواجهة TikTok Events API — لا ترمي أي خطأ أبدًا (فشل هذا التتبّع
// الاختياري يجب ألا يؤثر على إنشاء الطلب أو تحديث حالته بأي شكل).
async function sendTikTokEvent(eventName: string, order: TikTokEventOrderContext): Promise<void> {
  if (isE2ETestRun()) {
    logE2ESkip(`tiktok events api ${eventName} for ${order.orderNumber}`);
    return;
  }
  try {
    const settings = await getSiteSettings();
    if (!settings.tiktokPixelId || !settings.tiktokEventsApiAccessToken) return;
    const accessToken = decryptSecret(settings.tiktokEventsApiAccessToken);

    // TIKTOK_EVENTS_TEST_CODE: يُضبط مؤقتًا فمتغيرات البيئة فقط أثناء التحقق عبر صفحة
    // Test Events فتيك توك — تيك توك يستثني أي حدث يحمل هذا الحقل من التحسين الحقيقي
    // للحملات، فتثبيته بشكل دائم فالكود يُعطّل صامتًا تحسين الإعلانات الفعلي. يجب حذف
    // هذا المتغيّر من الإنتاج فور نجاح التحقق فصفحة Test Events.
    const testEventCode = process.env.TIKTOK_EVENTS_TEST_CODE || undefined;

    const payload = {
      event_source: "web",
      event_source_id: settings.tiktokPixelId,
      ...(testEventCode ? { test_event_code: testEventCode } : {}),
      data: [
        {
          event: eventName,
          event_time: Math.floor(Date.now() / 1000),
          event_id: order.orderNumber,
          user: {
            phone_number: [sha256(normalizePhoneForTikTok(order.phone))],
          },
          properties: {
            content_type: "product",
            currency: "DZD",
            value: order.totalDzd,
            order_id: order.orderNumber,
          },
        },
      ],
    };

    const res = await fetch("https://business-api.tiktok.com/open_api/v1.3/event/track/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Access-Token": accessToken,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.error("tiktok events api failed", eventName, order.orderNumber, await res.text().catch(() => ""));
    }
  } catch (error) {
    console.error("tiktok events api error", eventName, order.orderNumber, error);
  }
}

export function sendTikTokCompletePayment(order: TikTokEventOrderContext) {
  return sendTikTokEvent("CompletePayment", order);
}

export function sendTikTokOrderConfirmed(order: TikTokEventOrderContext) {
  return sendTikTokEvent("OrderConfirmed", order);
}

export function sendTikTokOrderDelivered(order: TikTokEventOrderContext) {
  return sendTikTokEvent("OrderDelivered", order);
}
