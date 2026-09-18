import { prisma } from "@/server/db/prisma";
import { writeAudit, writeAuditInTx } from "@/server/services/auditService";
import { raiseSystemAlert } from "@/server/modules/alerts/alertsService";
import { getProvider } from "@/server/modules/communications/providers";
import type { CommunicationChannel, CommunicationStatus, Prisma } from "@prisma/client";

// خدمة التواصل (P7) — الطبقة الوحيدة بين التطبيق والمزوّدين.
//
// دورة الحياة (حالات القاعدة كما هي): queued → sending → sent | failed ؛ delivered
// حين يؤكده المزوّد؛ cancelled إجراء بشري موثّق. لا "sent" إلا بتأكيد المزوّد.
//
// إلغاء التكرار الدائم: communications.dedupe_key UNIQUE — نفس الحدث التجاري
// (مثلاً order:<id>:status:confirmed) = صف واحد مهما تكررت المحاولات (HTTP/outbox/cron).
// الإرسال: claim CAS على lease (queued|failed مؤهَّل → sending) فعاملان متزامنان
// لا يرسلان الرسالة نفسها. محاولات محدودة (MAX_RETRIES) ثم failed نهائي + SystemAlert.
// provider unavailable = failed بسبب ضبط صريح وبلا إعادة (لا إرسال وهمي).
// طلبات isTest لا تُرسل أبدًا (يُرفض على مستوى الخدمة لا الواجهة).

export const MAX_RETRIES = 3;
const LEASE_MS = 60_000;

export type CommunicationActor = { type: "admin" | "system"; id?: string | null };

export class CommunicationError extends Error {
  constructor(
    readonly code: "NOT_FOUND" | "INVALID_STATE" | "TEST_ORDER" | "UNKNOWN_PROVIDER" | "UNKNOWN_TEMPLATE",
    message: string,
  ) {
    super(message);
    this.name = "CommunicationError";
  }
}

export const COMMUNICATION_ERROR_STATUS: Record<CommunicationError["code"], number> = {
  NOT_FOUND: 404,
  INVALID_STATE: 409,
  TEST_ORDER: 409,
  UNKNOWN_PROVIDER: 400,
  UNKNOWN_TEMPLATE: 400,
};

// ===================== القوالب =====================

export const COMMUNICATION_TEMPLATES = {
  order_confirmed: (v: { orderNumber: string; firstName: string }) =>
    `${v.firstName}، تأكد طلبك رقم ${v.orderNumber} وراهو يتحضر للشحن. شكرا لثقتك في Store DZ 🙏`,
  order_shipped: (v: { orderNumber: string; firstName: string }) =>
    `${v.firstName}، طلبك رقم ${v.orderNumber} خرج للتوصيل. الناقل راح يتصل بيك قريب.`,
  order_delivered: (v: { orderNumber: string; firstName: string }) =>
    `${v.firstName}، وصلك طلبك رقم ${v.orderNumber}؟ نتمنى يعجبك — Store DZ`,
  custom: (v: { body: string }) => v.body,
} as const;

export type CommunicationTemplate = keyof typeof COMMUNICATION_TEMPLATES;

export function isCommunicationTemplate(value: string): value is CommunicationTemplate {
  return value in COMMUNICATION_TEMPLATES;
}

export function renderTemplate(template: string, variables: Record<string, unknown>): string {
  if (!isCommunicationTemplate(template)) throw new CommunicationError("UNKNOWN_TEMPLATE", `قالب غير معروف: ${template}`);
  return (COMMUNICATION_TEMPLATES[template] as (v: Record<string, unknown>) => string)(variables);
}

// ===================== الإدراج =====================

export type QueueCommunicationInput = {
  orderId: string;
  channel: CommunicationChannel;
  provider: string;
  template: CommunicationTemplate;
  variables?: Record<string, unknown>;
  /** مفتاح إلغاء التكرار الدائم — للرسائل الآلية إلزامي؛ اليدوية بلا مفتاح */
  dedupeKey?: string | null;
  actor: CommunicationActor;
  correlationId?: string | null;
};

/** إدراج رسالة (queued). نفس dedupeKey = الصف الموجود (لا رسالة ثانية، `created:false`). */
export async function queueCommunication(input: QueueCommunicationInput) {
  if (!getProvider(input.provider)) {
    throw new CommunicationError("UNKNOWN_PROVIDER", `مزوّد غير معروف: ${input.provider}`);
  }
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    select: { id: true, isTest: true, customerId: true, orderNumber: true, customerFirstName: true },
  });
  if (!order) throw new CommunicationError("NOT_FOUND", "الطلب غير موجود");
  if (order.isTest) throw new CommunicationError("TEST_ORDER", "لا تواصل على طلب اختبار");

  const variables = {
    orderNumber: order.orderNumber,
    firstName: order.customerFirstName,
    ...(input.variables ?? {}),
  };
  try {
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.communication.create({
        data: {
          orderId: order.id,
          customerId: order.customerId,
          channel: input.channel,
          provider: input.provider,
          template: input.template,
          variables: variables as Prisma.InputJsonValue,
          dedupeKey: input.dedupeKey ?? null,
          status: "queued",
        },
      });
      await writeAuditInTx(tx, {
        actorType: input.actor.type,
        actorId: input.actor.id ?? null,
        action: "communication_queue",
        entityType: "communication",
        entityId: row.id,
        after: {
          orderId: order.id,
          channel: input.channel,
          provider: input.provider,
          template: input.template,
          dedupeKey: input.dedupeKey ?? null,
        },
        correlationId: input.correlationId ?? null,
      });
      return row;
    });
    return { communication: created, created: true };
  } catch (error) {
    if (input.dedupeKey && (error as { code?: string }).code === "P2002") {
      const existing = await prisma.communication.findUniqueOrThrow({ where: { dedupeKey: input.dedupeKey } });
      return { communication: existing, created: false };
    }
    throw error;
  }
}

// ===================== الإرسال =====================

export type DispatchResult = {
  id: string;
  status: CommunicationStatus;
  skipped?: "claimed_elsewhere" | "not_eligible";
};

/** إرسال رسالة واحدة عبر مزوّدها — claim CAS ثم المزوّد ثم الحالة النهائية. */
export async function dispatchCommunication(id: string): Promise<DispatchResult> {
  const now = new Date();
  const leaseFree = [{ leaseUntil: null }, { leaseUntil: { lt: now } }];
  const claimed = await prisma.communication.updateMany({
    where: {
      id,
      OR: [
        { status: "queued", OR: leaseFree },
        { status: "failed", retries: { lt: MAX_RETRIES }, OR: leaseFree },
        { status: "sending", leaseUntil: { lt: now } }, // عامل انهار
      ],
    },
    data: { status: "sending", leaseUntil: new Date(now.getTime() + LEASE_MS) },
  });
  if (claimed.count === 0) {
    const current = await prisma.communication.findUnique({ where: { id }, select: { status: true } });
    if (!current) throw new CommunicationError("NOT_FOUND", "الرسالة غير موجودة");
    return { id, status: current.status, skipped: current.status === "sending" ? "claimed_elsewhere" : "not_eligible" };
  }

  const row = await prisma.communication.findUniqueOrThrow({
    where: { id },
    include: { order: { select: { phone: true, isTest: true, orderNumber: true } } },
  });
  const provider = getProvider(row.provider);
  const variables = (row.variables ?? {}) as Record<string, unknown>;

  const finish = async (data: Prisma.CommunicationUpdateInput) => {
    await prisma.communication.update({ where: { id }, data: { ...data, leaseUntil: null } });
  };

  if (!provider || !row.order || row.order.isTest || !row.template) {
    await finish({
      status: "failed",
      retries: MAX_RETRIES,
      error: !provider ? "مزوّد غير معروف" : "طلب اختبار أو بلا قالب",
    });
    return { id, status: "failed" };
  }

  let result;
  try {
    result = await provider.send({ channel: row.channel, to: row.order.phone, body: renderTemplate(row.template, variables) });
  } catch (error) {
    result = { kind: "failed" as const, error: error instanceof Error ? error.message : String(error), retryable: true };
  }

  if (result.kind === "sent") {
    await finish({
      status: "sent",
      sentAt: new Date(),
      providerMessageId: result.providerMessageId ?? null,
      providerResponse: (result.response ?? {}) as Prisma.InputJsonValue,
      error: null,
    });
    return { id, status: "sent" };
  }
  if (result.kind === "manual") {
    // لا إرسال آلي: تبقى queued بالرابط الجاهز — الموظف يعلّمها sent بعد الإرسال فعليًا
    await finish({ status: "queued", providerResponse: { url: result.url } as Prisma.InputJsonValue });
    return { id, status: "queued" };
  }
  if (result.kind === "unavailable") {
    await finish({ status: "failed", retries: MAX_RETRIES, error: `provider_unavailable: ${result.reason}` });
    return { id, status: "failed" };
  }
  const retries = row.retries + 1;
  const exhausted = !result.retryable || retries >= MAX_RETRIES;
  await finish({ status: "failed", retries: exhausted ? MAX_RETRIES : retries, error: result.error });
  if (exhausted) {
    await raiseSystemAlert({
      type: "communication_failed",
      severity: "medium",
      message: `فشل إرسال رسالة ${row.channel}/${row.provider} للطلب ${row.order.orderNumber}`,
      entityType: "communication",
      entityId: id,
      metadata: { error: result.error, retries },
    });
  }
  return { id, status: "failed" };
}

/** إعادة إرسال ما فشل مؤقتًا (retries < MAX) — يُستدعى من cron automation-drain. */
export async function retryFailedCommunications(limit = 50): Promise<{ attempted: number; sent: number }> {
  const rows = await prisma.communication.findMany({
    where: { status: "failed", retries: { lt: MAX_RETRIES } },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true },
  });
  let sent = 0;
  for (const { id } of rows) {
    const r = await dispatchCommunication(id);
    if (r.status === "sent") sent++;
  }
  return { attempted: rows.length, sent };
}

// ===================== إجراءات بشرية موثّقة =====================

export async function retryCommunication(id: string, actor: CommunicationActor, reason: string) {
  const row = await prisma.communication.findUnique({ where: { id } });
  if (!row) throw new CommunicationError("NOT_FOUND", "الرسالة غير موجودة");
  if (row.status !== "failed") throw new CommunicationError("INVALID_STATE", `لا إعادة لرسالة حالتها ${row.status}`);
  // إعادة يدوية: تفتح محاولة واحدة إضافية حتى بعد الاستنفاد (بسبب موثّق)
  await prisma.communication.update({
    where: { id },
    data: { retries: Math.min(row.retries, MAX_RETRIES - 1), leaseUntil: null },
  });
  await writeAudit({
    actorType: actor.type,
    actorId: actor.id ?? null,
    action: "communication_retry",
    entityType: "communication",
    entityId: id,
    before: { status: row.status, retries: row.retries },
    reason,
  });
  return dispatchCommunication(id);
}

export async function cancelCommunication(id: string, actor: CommunicationActor, reason: string) {
  const row = await prisma.communication.findUnique({ where: { id } });
  if (!row) throw new CommunicationError("NOT_FOUND", "الرسالة غير موجودة");
  const guarded = await prisma.communication.updateMany({
    where: { id, status: { in: ["queued", "failed"] } },
    data: { status: "cancelled", leaseUntil: null },
  });
  if (guarded.count === 0) throw new CommunicationError("INVALID_STATE", `لا إلغاء لرسالة حالتها ${row.status}`);
  await writeAudit({
    actorType: actor.type,
    actorId: actor.id ?? null,
    action: "communication_cancel",
    entityType: "communication",
    entityId: id,
    before: { status: row.status },
    after: { status: "cancelled" },
    reason,
  });
  return prisma.communication.findUniqueOrThrow({ where: { id } });
}

/** رابط واتساب (manual): الموظف يؤكد أنه أرسل فعليًا — التأكيد بشري موثّق لا ادّعاء آلي. */
export async function markCommunicationSent(id: string, actor: CommunicationActor) {
  const row = await prisma.communication.findUnique({ where: { id } });
  if (!row) throw new CommunicationError("NOT_FOUND", "الرسالة غير موجودة");
  if (row.provider !== "whatsapp_deeplink") {
    throw new CommunicationError("INVALID_STATE", "التأكيد اليدوي لروابط واتساب فقط");
  }
  const guarded = await prisma.communication.updateMany({
    where: { id, status: "queued" },
    data: { status: "sent", sentAt: new Date(), leaseUntil: null },
  });
  if (guarded.count === 0) throw new CommunicationError("INVALID_STATE", `لا تأكيد لرسالة حالتها ${row.status}`);
  await writeAudit({
    actorType: actor.type,
    actorId: actor.id ?? null,
    action: "communication_mark_sent",
    entityType: "communication",
    entityId: id,
    before: { status: row.status },
    after: { status: "sent" },
  });
  return prisma.communication.findUniqueOrThrow({ where: { id } });
}

// ===================== قراءة =====================

export async function listCommunications(params: {
  orderId?: string;
  status?: CommunicationStatus;
  page: number;
  pageSize: number;
}) {
  const pageSize = Math.min(Math.max(1, params.pageSize), 100);
  const where: Prisma.CommunicationWhereInput = {
    ...(params.orderId ? { orderId: params.orderId } : {}),
    ...(params.status ? { status: params.status } : {}),
    order: { isTest: false },
  };
  const [items, total] = await Promise.all([
    prisma.communication.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (Math.max(1, params.page) - 1) * pageSize,
      take: pageSize,
      include: { order: { select: { id: true, orderNumber: true } } },
    }),
    prisma.communication.count({ where }),
  ]);
  return { items, total, pageSize };
}
