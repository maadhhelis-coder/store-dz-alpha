import { prisma } from "@/server/db/prisma";
import { writeAudit } from "@/server/services/auditService";
import { nudgeOutbox } from "@/server/modules/automation/outboxDrainer";
import type { DomainEventStatus, Prisma } from "@prisma/client";

// مراقبة الأتمتة (P7) — قراءة صندوق الأحداث وتنفيذاته، وإعادة تشغيل الفاشل يدويًا.
// الإعادة اليدوية موثّقة (audit) وتعيد الحدث إلى pending وتفتح تنفيذات dead_letter
// لمحاولة أخرى؛ التنفيذ نفسه يبقى عبر المشغّل (بوابة automation_runs كما هي).

export class AutomationError extends Error {
  constructor(
    readonly code: "NOT_FOUND" | "NOT_RETRYABLE",
    message: string,
  ) {
    super(message);
    this.name = "AutomationError";
  }
}

export async function listDomainEvents(params: { status?: DomainEventStatus; page: number; pageSize: number }) {
  const pageSize = Math.min(Math.max(1, params.pageSize), 100);
  const where: Prisma.DomainEventWhereInput = params.status ? { status: params.status } : {};
  const [items, total, counts] = await Promise.all([
    prisma.domainEvent.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (Math.max(1, params.page) - 1) * pageSize,
      take: pageSize,
      include: {
        automationRuns: { select: { handler: true, status: true, attempts: true, error: true, finishedAt: true } },
      },
    }),
    prisma.domainEvent.count({ where }),
    prisma.domainEvent.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const byStatus = Object.fromEntries(counts.map((c) => [c.status, c._count._all])) as Partial<
    Record<DomainEventStatus, number>
  >;
  return { items, total, pageSize, byStatus };
}

/** إعادة تشغيل حدث فاشل/مهمل — pending من جديد بعدّاد محاولات مصفَّر (بسبب موثّق). */
export async function retryDomainEvent(id: string, actor: { type: "admin"; id: string }, reason: string) {
  const event = await prisma.domainEvent.findUnique({
    where: { id },
    select: { id: true, status: true, eventType: true, attempts: true },
  });
  if (!event) throw new AutomationError("NOT_FOUND", "الحدث غير موجود");
  if (event.status !== "failed") throw new AutomationError("NOT_RETRYABLE", `لا إعادة لحدث حالته ${event.status}`);

  await prisma.$transaction(async (tx) => {
    const guarded = await tx.domainEvent.updateMany({
      where: { id, status: "failed" },
      data: { status: "pending", attempts: 0, lastError: null, processedAt: null, processingLeaseUntil: null },
    });
    if (guarded.count === 0) throw new AutomationError("NOT_RETRYABLE", "تغيّرت حالة الحدث أثناء الطلب");
    // تنفيذات dead_letter تُفتح لمحاولة جديدة؛ الناجحة تبقى ناجحة (لا تنفيذ مزدوج)
    await tx.automationRun.updateMany({
      where: { eventId: id, status: "dead_letter" },
      data: { status: "failed", error: null },
    });
  });
  await writeAudit({
    actorType: actor.type,
    actorId: actor.id,
    action: "automation_retry",
    entityType: "domain_event",
    entityId: id,
    before: { status: "failed", attempts: event.attempts },
    after: { status: "pending", eventType: event.eventType },
    reason,
  });
  nudgeOutbox();
  return { id, status: "pending" as const };
}
