import { prisma } from "@/server/db/prisma";
import { transitionOrderStatus } from "@/server/modules/orders/statusService";
import { outcomeAction, RISK_SORT_RANK } from "@/server/modules/confirmation/outcomeMapping";
import { executeIdempotent } from "@/server/modules/idempotency/durableIdempotency";
import { writeAudit } from "@/server/services/auditService";
import { getCrmSetting } from "@/server/modules/settings/crmSettingsService";
import type { ConfirmationOutcome, Prisma } from "@prisma/client";

// مركز التأكيد — Corrections 3/7/11/39:
// - كل نتيجة تُسجَّل في confirmation_attempts (أدلة تاريخية) ولا تُحوَّل لحالة طلب.
// - النتائج تشغّل آلة الحالات عبر transitionOrderStatus حصرًا (لا كتابة مباشرة).
// - no_answer/call_back: الطلب يبقى pending مع nextCallAt و callAttempts++
//   (المنطق انتقل من الحالات القديمة المحظورة إلى هنا).
// - الإسناد الذاتي CAS: وكيلان متزامنان → فائز واحد فقط، الخاسر 409 حتميًا.
// - كل المحاولات idempotent عبر executeIdempotent (PostgreSQL مرجع نهائي).
// - قائمة الانتظار تستثني isTest دائمًا وجلبها bounded (تصحيح 92).

export class OrderNotFoundError extends Error {
  readonly code = "NOT_FOUND";

  constructor() {
    super("الطلب غير موجود");
    this.name = "OrderNotFoundError";
  }
}

export class OrderNotPendingError extends Error {
  readonly code = "ORDER_NOT_PENDING";

  constructor(status: string) {
    super(`لا يمكن تسجيل محاولة تأكيد — حالة الطلب الحالية: ${status}`);
    this.name = "OrderNotPendingError";
  }
}

export class AssignmentConflictError extends Error {
  readonly code = "ASSIGNMENT_CONFLICT";

  constructor() {
    super("الطلب أُسند لموظف آخر للتو");
    this.name = "AssignmentConflictError";
  }
}

export type RecordAttemptInput = {
  orderId: string;
  outcome: ConfirmationOutcome;
  note?: string;
  nextFollowUpAt?: Date | null;
  durationSec?: number | null;
  idempotencyKey?: string | null;
  actor: { type: "admin" | "api"; id: string };
  correlationId?: string | null;
};

/** تسجيل محاولة تأكيد — المحاولة + إجراؤها متلازمان، والـidempotency الدائم
 * يمنع تكرار المحاولة عند إعادة إرسال نفس الطلب بنفس المفتاح (replay بلا سجل جديد). */
export async function recordConfirmationAttempt(input: RecordAttemptInput) {
  if (!input.idempotencyKey) {
    return executeAttempt(input);
  }

  const result = await executeIdempotent(
    {
      actorId: input.actor.id,
      operation: "confirmation.attempt",
      idempotencyKey: input.idempotencyKey,
      payload: { orderId: input.orderId, outcome: input.outcome, note: input.note ?? null },
    },
    () => executeAttempt(input),
  );
  return result.value;
}

async function executeAttempt(input: RecordAttemptInput) {
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    select: { id: true, status: true, orderNumber: true, customerId: true, isTest: true },
  });
  if (!order) throw new OrderNotFoundError();

  // المحاولات مشروعة على pending وعلى الحالات القديمة التاريخية (قراءة) —
  // الاستثناء: الطلب خرج من عائلة "بانتظار التأكيد" نهائيًا.
  const awaitingFamily = ["pending", "no_answer", "callback", "voicemail"];
  if (!awaitingFamily.includes(order.status)) {
    throw new OrderNotPendingError(order.status);
  }

  // 1) سجل المحاولة أولًا — الأدلة التاريخية تبقى حتى لو فشل الإجراء بعدها
  const attempt = await prisma.confirmationAttempt.create({
    data: {
      orderId: order.id,
      customerId: order.customerId,
      agentId: input.actor.type === "admin" ? input.actor.id : null,
      outcome: input.outcome,
      note: input.note ?? null,
      nextFollowUpAt: input.nextFollowUpAt ?? null,
      durationSec: input.durationSec ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
    },
  });

  // 2) الإجراء عبر الخريطة الحتمية (تصحيح 3) — عبر آلة الحالات حصرًا
  const action = outcomeAction(input.outcome);

  if (action.kind === "transition" || action.kind === "transition_with_task") {
    await transitionOrderStatus(order.id, action.to, {
      actor: { type: input.actor.type, id: input.actor.id },
      reason: input.note ?? `نتيجة اتصال: ${input.outcome}`,
      correlationId: input.correlationId ?? null,
      metadata: { attemptId: attempt.id },
    });

    if (action.kind === "transition_with_task") {
      // مراجعة يدوية إلزامية — لا حظر تلقائي أبدًا (تصحيح 8/33)
      await prisma.task.create({
        data: {
          type: "manual_review",
          orderId: order.id,
          customerId: order.customerId,
          priority: "high",
          source: "automation",
          payload: { attemptId: attempt.id, outcome: input.outcome } as Prisma.InputJsonValue,
          createdById: input.actor.type === "admin" ? input.actor.id : null,
        },
      });
    }
  } else if (action.scheduleFollowUp) {
    // nextCallAt: صراحةً من الموظف إن وُجد، وإلا افتراضي تشغيلي ساعة
    const followUpAt = input.nextFollowUpAt ?? new Date(Date.now() + 60 * 60 * 1000);
    await prisma.order.update({
      where: { id: order.id },
      data: { nextCallAt: followUpAt, callAttempts: { increment: 1 } },
    });
  } else if (input.note) {
    // customer_requested_change: الطلب يبقى pending — الملاحظة تُحفظ للمرجعية
    await prisma.order.update({ where: { id: order.id }, data: { notes: input.note } });
  }

  await writeAudit({
    actorType: input.actor.type,
    actorId: input.actor.id,
    action: "confirmation_attempt",
    entityType: "order",
    entityId: order.id,
    after: { outcome: input.outcome, attemptId: attempt.id },
    reason: input.note ?? null,
    correlationId: input.correlationId ?? null,
  });

  const orderAfter = await prisma.order.findUnique({ where: { id: order.id }, select: { status: true } });
  return { attemptId: attempt.id, orderStatusAfter: orderAfter?.status ?? null };
}

// ===================== قائمة الانتظار =====================

export type QueueItem = {
  id: string;
  orderNumber: string;
  status: string;
  customerFirstName: string;
  customerLastName: string;
  phone: string;
  wilayaName: string;
  commune: string;
  deliveryOption: string;
  totalDzd: number;
  createdAt: Date;
  nextCallAt: Date | null;
  callAttempts: number;
  assignedAgentId: string | null;
  riskLevel: string | null;
  customerId: string | null;
  productSummary: string;
  attemptsCount: number;
  followUpDue: boolean;
  slaOverdueMinutes: number | null;
};

/** قائمة طلبات بانتظار التأكيد — الترتيب الحتمي: مستحق إعادة الاتصال → متجاوز
 * SLA → مخاطرة أعلى → قيمة أعلى → أقدم (كسر التعادل بcreatedAt/id).
 * isTest مستثنى دائمًا؛ الجلب bounded (تصحيح 92). */
export async function getConfirmationQueue(params: {
  page: number;
  pageSize: number;
  assignedOnly?: boolean;
  agentId?: string;
}): Promise<{ items: QueueItem[]; total: number }> {
  const slaMinutes = (await getCrmSetting("task_sla_minutes")).confirm_order;
  const now = new Date();

  const where: Prisma.OrderWhereInput = {
    status: "pending",
    isTest: false,
    ...(params.assignedOnly ? { assignedAgentId: params.agentId ?? null } : {}),
  };

  const [candidates, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        customer: { select: { riskLevel: true } },
        items: { select: { productNameSnapshot: true }, take: 1 },
        _count: { select: { confirmationAttempts: true } },
      },
      orderBy: [{ nextCallAt: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
      // bounded جلب أولي — قائمة العمل صفحة صغيرة مهما كان حجم الجدول
      take: Math.min(params.pageSize * 5, 500),
    }),
    prisma.order.count({ where }),
  ]);

  const enriched: QueueItem[] = candidates.map((order) => {
    const ageMinutes = Math.floor((now.getTime() - order.createdAt.getTime()) / 60000);
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      customerFirstName: order.customerFirstName,
      customerLastName: order.customerLastName,
      phone: order.phone,
      wilayaName: order.wilayaName,
      commune: order.commune,
      deliveryOption: order.deliveryOption,
      totalDzd: order.totalDzd,
      createdAt: order.createdAt,
      nextCallAt: order.nextCallAt,
      callAttempts: order.callAttempts,
      assignedAgentId: order.assignedAgentId,
      riskLevel: order.customer?.riskLevel ?? null,
      customerId: order.customerId,
      productSummary: order.items[0]?.productNameSnapshot ?? "",
      attemptsCount: order._count.confirmationAttempts,
      followUpDue: order.nextCallAt !== null && order.nextCallAt <= now,
      slaOverdueMinutes: ageMinutes > slaMinutes ? ageMinutes : null,
    };
  });

  // الفرز الدقيق الحتمي — breaker أخير بid لمنع تذبذب الترتيب بين الصفحات
  enriched.sort((a, b) => {
    const dueDiff = Number(b.followUpDue) - Number(a.followUpDue);
    if (dueDiff !== 0) return dueDiff;
    const slaDiff = Number(b.slaOverdueMinutes !== null) - Number(a.slaOverdueMinutes !== null);
    if (slaDiff !== 0) return slaDiff;
    const riskDiff =
      (RISK_SORT_RANK[b.riskLevel ?? "low"] ?? 0) - (RISK_SORT_RANK[a.riskLevel ?? "low"] ?? 0);
    if (riskDiff !== 0) return riskDiff;
    if (b.totalDzd !== a.totalDzd) return b.totalDzd - a.totalDzd;
    if (a.createdAt.getTime() !== b.createdAt.getTime()) return a.createdAt.getTime() - b.createdAt.getTime();
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const start = (params.page - 1) * params.pageSize;
  return { items: enriched.slice(start, start + params.pageSize), total };
}

// ===================== الإسناد الذاتي CAS =====================

/** إسناد ذاتي CAS (تصحيح 39): updateMany بشرط "غير مُسند أو مُسند لنفس الوكيل"
 * — وكيلان متزامنان: فائز واحد، الخاسر 409 حتميًا، ولا assignedAgentId مزدوجة. */
export async function selfAssignOrder(orderId: string, agentId: string): Promise<void> {
  const updated = await prisma.order.updateMany({
    where: {
      id: orderId,
      status: "pending",
      isTest: false,
      OR: [{ assignedAgentId: null }, { assignedAgentId: agentId }],
    },
    data: { assignedAgentId: agentId },
  });
  if (updated.count === 0) {
    // فرّق 404 (غير موجود/خرج من pending) عن 409 (سباق إسناد حقيقي)
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { status: true, assignedAgentId: true },
    });
    if (!order || order.status !== "pending") throw new OrderNotFoundError();
    throw new AssignmentConflictError();
  }
}

/** تحرير الإسناد — التحقق من الصلاحية على مستوى الroute (orders.assign). */
export async function unassignOrder(orderId: string): Promise<void> {
  await prisma.order.updateMany({
    where: { id: orderId },
    data: { assignedAgentId: null },
  });
}
