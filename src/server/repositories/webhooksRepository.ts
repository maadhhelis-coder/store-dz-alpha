import { prisma } from "@/server/db/prisma";
import type { WebhookEvent } from "@prisma/client";

// حقول القوائم/العرض العامة — تستثني `secret` عمدًا؛ لا يجب أن يُعاد سر التوقيع لأي واجهة
// بعد لحظة الإنشاء الأولى (نفس مبدأ مفاتيح API: يُعرض مرة واحدة فقط عند الإنشاء).
const PUBLIC_SELECT = {
  id: true,
  url: true,
  events: true,
  isActive: true,
  lastStatus: true,
  lastFiredAt: true,
  createdAt: true,
} as const;

export function listWebhooks() {
  return prisma.webhook.findMany({ orderBy: { createdAt: "desc" }, select: PUBLIC_SELECT });
}

export type ListWebhooksPageParams = { page: number; pageSize: number };

export async function listWebhooksPage(params: ListWebhooksPageParams) {
  const [items, total] = await Promise.all([
    prisma.webhook.findMany({
      orderBy: { createdAt: "desc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      select: PUBLIC_SELECT,
    }),
    prisma.webhook.count(),
  ]);
  return { items, total };
}

export function createWebhook(url: string, events: WebhookEvent[], encryptedSecret: string) {
  return prisma.webhook.create({ data: { url, events, secret: encryptedSecret }, select: PUBLIC_SELECT });
}

export function deleteWebhook(id: string) {
  return prisma.webhook.delete({ where: { id } });
}

// يشمل `secret` عمدًا — يُستعمل داخليًا فقط عند الإرسال الفعلي لحساب توقيع HMAC، لا يُعاد
// أبدًا لأي استجابة HTTP.
export function findActiveWebhooksForEvent(event: WebhookEvent) {
  return prisma.webhook.findMany({ where: { isActive: true, events: { has: event } } });
}

export function recordWebhookFireResult(id: string, status: number) {
  return prisma.webhook.update({
    where: { id },
    data: { lastStatus: status, lastFiredAt: new Date() },
  });
}
