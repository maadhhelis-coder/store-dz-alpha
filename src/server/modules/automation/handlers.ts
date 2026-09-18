import { registerHandler } from "@/server/modules/automation/outboxDrainer";
import { syncOrderToSheets } from "@/server/modules/integrations/sheetsSync";
import { queueCommunication, dispatchCommunication } from "@/server/modules/communications/communicationService";
import { getCrmSetting } from "@/server/modules/settings/crmSettingsService";
import { prisma } from "@/server/db/prisma";
import type { DomainEvent } from "@prisma/client";

// معالِجات الأتمتة (P7) — تُسجَّل في نفس سجل المشغّل الذي يخدم شحنات P5.
// كل معالِج: idempotent (بوابة automation_runs UNIQUE(event,handler) + مفاتيح دائمة في
// الخدمات)، لا يكتب حدثًا جديدًا (فلا حلقات)، يتجاهل طلبات isTest، ويرمي عند الفشل
// الحقيقي ليعيد المشغّل المحاولة ثم dead-letter + SystemAlert.
//
// التفعيل لكل معالِج من crm_settings.automation_enabled (مفتاح = اسم المعالِج):
// - الشيت مفعّل افتراضيًا (كان يُرسل من المتصفح قبل P7).
// - رسائل الزبون **معطّلة افتراضيًا**: الوكيل الخارجي (store-dz-agent) يراسل الزبائن
//   اليوم عبر واتساب؛ تفعيل هذا المعالِج مع بقاء الوكيل = رسالتان. قرار المالك.

export const SHEETS_CREATED_HANDLER = "order.created:sheets-sync";
export const SHEETS_STATUS_HANDLER = "order.status_changed:sheets-sync";
export const NOTIFY_CUSTOMER_HANDLER = "order.status_changed:notify-customer";

const DEFAULT_ENABLED: Record<string, boolean> = {
  [SHEETS_CREATED_HANDLER]: true,
  [SHEETS_STATUS_HANDLER]: true,
  [NOTIFY_CUSTOMER_HANDLER]: false,
};

export async function isHandlerEnabled(handler: string): Promise<boolean> {
  const map = await getCrmSetting("automation_enabled");
  return map[handler] ?? DEFAULT_ENABLED[handler] ?? false;
}

/** حالات الطلب التي تستحق رسالة للزبون — قالب لكل حالة (لا رسالة لغيرها). */
const STATUS_TEMPLATES: Record<string, "order_confirmed" | "order_shipped" | "order_delivered"> = {
  confirmed: "order_confirmed",
  shipped: "order_shipped",
  delivered: "order_delivered",
};

async function sheetsCreated(event: DomainEvent) {
  if (!(await isHandlerEnabled(SHEETS_CREATED_HANDLER))) return;
  await syncOrderToSheets(event.entityId, "order.created");
}

async function sheetsStatusChanged(event: DomainEvent) {
  if (!(await isHandlerEnabled(SHEETS_STATUS_HANDLER))) return;
  await syncOrderToSheets(event.entityId, "order.status_changed");
}

async function notifyCustomer(event: DomainEvent) {
  if (!(await isHandlerEnabled(NOTIFY_CUSTOMER_HANDLER))) return;
  const to = (event.payload as { to?: string }).to;
  const template = to ? STATUS_TEMPLATES[to] : undefined;
  if (!template) return;
  const order = await prisma.order.findUnique({ where: { id: event.entityId }, select: { isTest: true } });
  if (!order || order.isTest) return;
  // مفتاح دائم: طلب+حالة — تكرار الحدث/المحاولة لا يُنتج رسالة ثانية
  const { communication } = await queueCommunication({
    orderId: event.entityId,
    channel: "whatsapp",
    provider: "whatsapp_cloud",
    template,
    dedupeKey: `order:${event.entityId}:status:${to}`,
    actor: { type: "system" },
    correlationId: event.correlationId,
  });
  await dispatchCommunication(communication.id);
}

registerHandler(SHEETS_CREATED_HANDLER, sheetsCreated);
registerHandler(SHEETS_STATUS_HANDLER, sheetsStatusChanged);
registerHandler(NOTIFY_CUSTOMER_HANDLER, notifyCustomer);
