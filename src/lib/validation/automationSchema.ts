import { z } from "zod";
import { CommunicationStatus, DomainEventStatus } from "@prisma/client";
import { PROVIDER_NAMES } from "@/server/modules/communications/providers";

// مخططات P7 (التواصل/الأتمتة) — حدود النظام فقط.

const reason = z.string().trim().min(1).max(500);
const page = z.coerce.number().int().min(1).default(1);
const pageSize = z.coerce.number().int().min(1).max(100).default(20);

export const communicationsListQuerySchema = z.object({
  orderId: z.string().uuid().optional(),
  status: z.enum(CommunicationStatus).optional(),
  page,
  pageSize,
});

export const sendCommunicationSchema = z.object({
  orderId: z.string().uuid(),
  provider: z.enum(PROVIDER_NAMES as [string, ...string[]]),
  template: z.enum(["order_confirmed", "order_shipped", "order_delivered", "custom"]),
  body: z.string().trim().min(1).max(1000).optional(),
});

export const communicationActionSchema = z.object({ reason: reason.optional() });

export const automationListQuerySchema = z.object({
  status: z.enum(DomainEventStatus).optional(),
  page,
  pageSize,
});

export const automationRetrySchema = z.object({ reason });
