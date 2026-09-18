import * as emailIntegrationsRepository from "@/server/repositories/emailIntegrationsRepository";
import { isE2ETestRun, logE2ESkip } from "@/lib/e2eGuard";
import type { CommunicationChannel } from "@prisma/client";

// مزوّدو التواصل (P7) — تجريد واحد: send() تُرجع نتيجة صريحة ولا تدّعي نجاحًا.
//
// - whatsapp_deeplink: لا API — يُنتج رابط wa.me يفتحه الموظف بنفسه (manual).
// - whatsapp_cloud: Meta Cloud API نصّيًا؛ بلا WHATSAPP_CLOUD_ACCESS_TOKEN/PHONE_NUMBER_ID
//   = unavailable (حالة ضبط صريحة، لا إرسال وهمي). ملاحظة: الوكيل الخارجي
//   (store-dz-agent) هو من يراسل الزبائن حاليًا — التفعيل هنا قرار تشغيلي عبر
//   crm_settings.automation_enabled حتى لا تُرسل رسالتان.
// - sms: لا مزوّد SMS متعاقَد معه — stub يُرجع unavailable دائمًا (لا اختراع مزوّد).
// - email: تكامل Gmail الحالي بصلاحية gmail.readonly فقط — لا إرسال ممكن؛ unavailable
//   بسبب واضح حتى يُوسَّع النطاق (P8+).

export type SendResult =
  | { kind: "sent"; providerMessageId?: string | null; response?: Record<string, unknown> }
  | { kind: "manual"; url: string }
  | { kind: "failed"; error: string; retryable: boolean }
  | { kind: "unavailable"; reason: string };

export type OutboundMessage = {
  channel: CommunicationChannel;
  to: string;
  body: string;
  subject?: string | null;
};

export type CommunicationProvider = {
  name: string;
  channel: CommunicationChannel;
  send(message: OutboundMessage): Promise<SendResult>;
};

const PROVIDER_TIMEOUT_MS = 10_000;

/** 05… → 2135… (E.164 بلا +) — الرقم يصل من الطلب بصيغة محلية مُتحقَّق منها. */
export function toInternationalPhone(local: string): string {
  const digits = local.replace(/\D/g, "");
  return digits.startsWith("0") ? `213${digits.slice(1)}` : digits;
}

export const whatsappDeepLinkProvider: CommunicationProvider = {
  name: "whatsapp_deeplink",
  channel: "whatsapp",
  async send(message) {
    // الرابط يفتح محادثة مع الزبون — لا إرسال آلي فلا "sent" أبدًا
    return {
      kind: "manual",
      url: `https://wa.me/${toInternationalPhone(message.to)}?text=${encodeURIComponent(message.body)}`,
    };
  },
};

export const whatsappCloudProvider: CommunicationProvider = {
  name: "whatsapp_cloud",
  channel: "whatsapp",
  async send(message) {
    if (isE2ETestRun()) {
      logE2ESkip("whatsapp cloud send");
      return { kind: "unavailable", reason: "E2E: لا إرسال حقيقي" };
    }
    const token = process.env.WHATSAPP_CLOUD_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID;
    if (!token || !phoneNumberId) {
      return {
        kind: "unavailable",
        reason: "WhatsApp Cloud API غير مضبوط (WHATSAPP_CLOUD_ACCESS_TOKEN / WHATSAPP_CLOUD_PHONE_NUMBER_ID)",
      };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
    try {
      const res = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: toInternationalPhone(message.to),
          type: "text",
          text: { body: message.body },
        }),
        signal: controller.signal,
      });
      const json = (await res.json().catch(() => ({}))) as {
        messages?: { id?: string }[];
        error?: { message?: string; code?: number };
      };
      if (!res.ok) {
        // 4xx = طلب/قالب/نافذة مرفوض (لا يُعاد)؛ 5xx/429 = عابر
        const retryable = res.status >= 500 || res.status === 429;
        return { kind: "failed", error: `WhatsApp ${res.status}: ${json.error?.message ?? "خطأ"}`, retryable };
      }
      return { kind: "sent", providerMessageId: json.messages?.[0]?.id ?? null, response: { status: res.status } };
    } catch (error) {
      return { kind: "failed", error: error instanceof Error ? error.message : String(error), retryable: true };
    } finally {
      clearTimeout(timer);
    }
  },
};

export const smsProvider: CommunicationProvider = {
  name: "sms",
  channel: "sms",
  async send() {
    return { kind: "unavailable", reason: "لا مزوّد SMS متعاقَد معه بعد" };
  },
};

export const emailProvider: CommunicationProvider = {
  name: "gmail",
  channel: "email",
  async send() {
    const integration = await emailIntegrationsRepository.findEmailIntegration("gmail");
    if (!integration?.isConnected) return { kind: "unavailable", reason: "Gmail غير متصل" };
    return {
      kind: "unavailable",
      reason: "Gmail متصل بصلاحية قراءة فقط (gmail.readonly) — الإرسال غير مفعّل",
    };
  },
};

const PROVIDERS: Record<string, CommunicationProvider> = {
  whatsapp_deeplink: whatsappDeepLinkProvider,
  whatsapp_cloud: whatsappCloudProvider,
  sms: smsProvider,
  gmail: emailProvider,
};

export function getProvider(name: string): CommunicationProvider | null {
  return PROVIDERS[name] ?? null;
}

export const PROVIDER_NAMES = Object.keys(PROVIDERS);
