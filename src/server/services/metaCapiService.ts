import { createHash } from "crypto";
import { getSiteSettings } from "@/server/services/siteSettingsService";
import { decryptSecret } from "@/lib/crypto/secretBox";
import { isE2ETestRun, logE2ESkip } from "@/lib/e2eGuard";

function sha256(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

// أرقام الهاتف الجزائرية تُرسَل لميتا بصيغة دولية (+213) قبل التجزئة (Hash) — هذا ما تتوقعه
// مطابقة ميتا (Advanced Matching) للربط بحساب المستخدم الحقيقي.
function normalizePhoneForMeta(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const withoutLeadingZero = digits.startsWith("0") ? digits.slice(1) : digits;
  return `213${withoutLeadingZero}`;
}

export type MetaCapiOrderContext = {
  orderNumber: string;
  totalDzd: number;
  phone: string;
  firstName: string;
  lastName: string;
  ipAddress?: string;
  userAgent?: string;
};

// ترسل حدث تحويل لواجهة Meta Conversions API — لا ترمي أي خطأ أبدًا (فشل هذا التتبّع
// الاختياري يجب ألا يؤثر على إنشاء الطلب أو تحديث حالته بأي شكل).
async function sendMetaCapiEvent(eventName: string, order: MetaCapiOrderContext): Promise<void> {
  if (isE2ETestRun()) {
    logE2ESkip(`meta capi ${eventName} for ${order.orderNumber}`);
    return;
  }
  try {
    const settings = await getSiteSettings();
    if (!settings.metaPixelId || !settings.metaCapiAccessToken) return;
    const accessToken = decryptSecret(settings.metaCapiAccessToken);

    const payload = {
      data: [
        {
          event_name: eventName,
          event_time: Math.floor(Date.now() / 1000),
          event_id: order.orderNumber,
          action_source: "website",
          user_data: {
            ph: [sha256(normalizePhoneForMeta(order.phone))],
            fn: [sha256(order.firstName)],
            ln: [sha256(order.lastName)],
            ...(order.ipAddress ? { client_ip_address: order.ipAddress } : {}),
            ...(order.userAgent ? { client_user_agent: order.userAgent } : {}),
          },
          custom_data: {
            currency: "DZD",
            value: order.totalDzd,
            order_id: order.orderNumber,
          },
        },
      ],
    };

    const url = `https://graph.facebook.com/v21.0/${settings.metaPixelId}/events?access_token=${encodeURIComponent(accessToken)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.error("meta capi event failed", eventName, order.orderNumber, await res.text().catch(() => ""));
    }
  } catch (error) {
    console.error("meta capi event error", eventName, order.orderNumber, error);
  }
}

// عند إرسال الاستمارة: Lead (نفس event_id مع Lead المتصفح فيُدمجان). «شراء» لا يُحتسب هنا —
// طلب صريح: «شراء» يتحسب غير بعد التأكيد، باش Meta ما يحسبهاش مرتين.
export function sendMetaCapiLead(order: MetaCapiOrderContext) {
  return sendMetaCapiEvent("Lead", order);
}

// عند تأكيد الطلب (هاتف/واتساب) — الحدث الوحيد «Purchase» لهذا الطلب.
export function sendMetaCapiPurchase(order: MetaCapiOrderContext) {
  return sendMetaCapiEvent("Purchase", order);
}

export function sendMetaCapiOrderDelivered(order: MetaCapiOrderContext) {
  return sendMetaCapiEvent("OrderDelivered", order);
}
