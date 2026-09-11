import { getSiteSettings } from "@/server/services/siteSettingsService";
import { isE2ETestRun, logE2ESkip } from "@/lib/e2eGuard";

// قناة إشعارات صاحب المتجر — Telegram عبر نفس البوت الذي يستعمله الوكيل الذكي
// (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID). مفاتيح تبويب «الإشعارات» فلوحة التحكم كانت
// تُحفظ بلا أي أثر (لا قناة إرسال أصلًا) — هنا تصبح فعلية: كل نوع يُرسَل فقط إذا كان
// مفتاحه مفعّلًا. غياب متغيرَي البيئة = تعطيل صامت (لا رمي، لا إسقاط لأي عملية).
//
// ponytail: Telegram فقط — بريد/SMS عند طلب فعلي (تكامل Gmail موجود بلا مُرسِل بعد).

export type OwnerNotificationKind = "orders" | "alerts" | "system";

const TELEGRAM_TIMEOUT_MS = 8_000;

export function isOwnerNotifyConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

export async function notifyOwner(kind: OwnerNotificationKind, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  if (isE2ETestRun()) {
    logE2ESkip(`owner notification (${kind})`);
    return;
  }
  try {
    const s = await getSiteSettings();
    const enabled = { orders: s.notifyOrders, alerts: s.notifyAlerts, system: s.notifySystem }[kind];
    if (!enabled) return;
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: AbortSignal.timeout(TELEGRAM_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`telegram ${res.status}`);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "owner_notify_failed",
        kind,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      }),
    );
  }
}
