import { z } from "zod";
import type { ConfirmationOutcome } from "@prisma/client";

// مخططات التحقق لمركز التأكيد — zod على الجسم والاستعلام معًا.

export const confirmationOutcomeSchema = z.enum([
  "confirmed",
  "no_answer",
  "call_back",
  "wrong_number",
  "cancelled",
  "duplicate",
  "fraud_suspected",
  "customer_requested_change",
]);

export const recordAttemptSchema = z.object({
  orderId: z.string().uuid(),
  outcome: confirmationOutcomeSchema,
  note: z.string().max(2000).optional(),
  nextFollowUpAt: z.string().datetime().optional().nullable(),
  durationSec: z.number().int().min(0).max(24 * 60 * 60).optional().nullable(),
  idempotencyKey: z.string().trim().min(8).max(100).optional().nullable(),
});

export const queueQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  mine: z.coerce.boolean().optional(),
});

export const assignSchema = z.object({
  orderId: z.string().uuid(),
});

export const agentPerformanceQuerySchema = z.object({
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  agentId: z.string().uuid().optional(),
});

export type RecordAttemptInput = z.infer<typeof recordAttemptSchema>;
export type { ConfirmationOutcome };
