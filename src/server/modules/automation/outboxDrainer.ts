import { prisma } from "@/server/db/prisma";
import { redactErrorMessage } from "@/lib/redact";
import { raiseSystemAlert } from "@/server/modules/alerts/alertsService";
import type { DomainEvent, Prisma } from "@prisma/client";

// مشغّل الـoutbox — يستعيد الأحداث الملتزمة معاملاتيًا وينفذ معالِجاتها مرة
// واحدة حتمًا (automation_runs UNIQUE(event_id, handler) هي بوابة الـidempotency).
//
// منع الحلقات (Correction 63): causationId + automationDepth + originatingHandler؛
// عمق أقصى قابل للضبط (افتراضي 3)؛ السلاسل السببية الدائرية تُرفض (حدث لا يمكن
// أن يكون سببًا لأحد أسلافه) — نفس نوع الحدث في سلسلة مشروعة مسموح.
//
// الاستدعاء: after() للزمن المنخفض + cron automation-drain كل 5 دقائق للاستعادة.
// الأحداث الفاشلة بعد maxAttempts → dead_letter + SystemAlert (P7 يربط التنبيه).

const LEASE_SECONDS = 120;
const BATCH_SIZE = 20;
const DEFAULT_MAX_DEPTH = 3;
const MAX_ATTEMPTS_PER_HANDLER = 3;

export type DomainEventHandler = (event: DomainEvent) => Promise<void>;

// سجل المعالِجات — يُملأ من modules/automation (P7)؛ في P1 السجل فارغ والمشغّل
// يصرّف الأحداث بلا معالِجات (لا شيء يُنفَّذ — آمن بالكامل).
const handlers = new Map<string, DomainEventHandler>();

export function registerHandler(handlerName: string, handler: DomainEventHandler): void {
  if (handlers.has(handlerName)) {
    throw new Error(`معالِج automation مكرر: ${handlerName}`);
  }
  handlers.set(handlerName, handler);
}

/** هل السبب الدائرى؟ — يصعد سلسلة causation ويبحث عن الـid الحالي. */
async function isCyclicCausation(event: DomainEvent): Promise<boolean> {
  let currentCausationId = event.causationId;
  const visited = new Set<string>();
  while (currentCausationId) {
    if (currentCausationId === event.id) return true;
    if (visited.has(currentCausationId)) return true; // دورة في الأسلاف أنفسهم
    visited.add(currentCausationId);
    const parent: { causationId: string | null } | null = await prisma.domainEvent.findUnique({
      where: { id: currentCausationId },
      select: { causationId: true },
    });
    if (!parent) break;
    currentCausationId = parent.causationId;
  }
  return false;
}

/** صرف دفعة من الأحداث المعلقة — تُستدعى من after() وcron. آمنة للاستدعاء المتزامن
 * (claim CAS على lease). تُرجع عدد الأحداث التي عولجت بالكامل. */
export async function drainOutbox(maxEvents = BATCH_SIZE): Promise<{ processed: number; failed: number }> {
  const now = new Date();

  // استعادة: pending أو processing انتهى leaseه (عامل انهار) — claim CAS فائز واحد
  const reclaimable = await prisma.domainEvent.findMany({
    where: {
      OR: [
        { status: "pending" },
        { status: "processing", processingLeaseUntil: { lt: now } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: maxEvents,
    select: { id: true },
  });

  let processed = 0;
  let failed = 0;

  for (const { id } of reclaimable) {
    const leaseUntil = new Date(now.getTime() + LEASE_SECONDS * 1000);
    const claimed = await prisma.domainEvent.updateMany({
      where: {
        id,
        OR: [{ status: "pending" }, { status: "processing", processingLeaseUntil: { lt: now } }],
      },
      data: {
        status: "processing",
        processingStartedAt: now,
        processingLeaseUntil: leaseUntil,
        attempts: { increment: 1 },
      },
    });
    if (claimed.count === 0) continue; // عامل آخر أفاز به

    const event = await prisma.domainEvent.findUnique({ where: { id } });
    if (!event) continue;

    try {
      await processEvent(event);
      await prisma.domainEvent.update({
        where: { id },
        data: { status: "processed", processedAt: new Date(), lastError: null },
      });
      processed++;
    } catch (error) {
      failed++;
      const message = error instanceof Error ? error.message : String(error);
      const exhausted = event.attempts >= MAX_ATTEMPTS_PER_HANDLER;
      await prisma.domainEvent.update({
        where: { id },
        data: {
          // dead_letter عند استنفاد المحاولات — لا استعادة تلقائية بعدها
          status: exhausted ? "failed" : "pending",
          lastError: message.slice(0, 2000),
          ...(exhausted ? { processedAt: new Date() } : {}),
        },
      });
      // أول مستهلك للتنبيهات (P2): dead-letter يستدعي raiseSystemAlert — لا صمت
      // بعد الآن. الاستدعاء لا يرمي أبدًا فاستمرار الصرف لا يتأثر بفشل التنبيه.
      if (exhausted) {
        await raiseSystemAlert({
          type: "dead_letter_accumulation",
          severity: "high",
          message: `حدث outbox دخل dead-letter بعد استنفاد المحاولات: ${event.eventType}`,
          entityType: "domain_event",
          entityId: id,
          metadata: {
            eventId: id,
            eventType: event.eventType,
            attempts: event.attempts,
            lastError: redactErrorMessage(message.slice(0, 500)),
          },
        });
      }
      console.error(
        JSON.stringify({
          event: "outbox_event_failed",
          eventId: id,
          eventType: event.eventType,
          attempts: event.attempts,
          deadLetter: exhausted,
          error: message,
          timestamp: new Date().toISOString(),
        }),
      );
    }
  }

  return { processed, failed };
}

/** تنفيذ كل المعالِجات المسجلة للحدث — كل معالِج عبر بوابة UNIQUE(event,handler). */
async function processEvent(event: DomainEvent): Promise<void> {
  // أمان السببية: سلسلة دائرية = خطأ برمجي — لا تنفيذ إطلاقًا
  if (await isCyclicCausation(event)) {
    throw new Error(`سلسلة سببية دائرية للحدث ${event.id} (${event.eventType})`);
  }

  const relevant = Array.from(handlers.entries()).filter(([name]) => handlerWantsEvent(name, event));
  if (relevant.length === 0) return; // لا معالِجات بعد — الحدث "processed" بلا عمل

  for (const [handlerName, handler] of relevant) {
    // بوابة الـidempotency: INSERT فريد — الفائز فقط ينفّذ؛ إعادة التسليم لا تضاعف
    const gate = await prisma.automationRun
      .create({
        data: { eventId: event.id, handler: handlerName, status: "success", startedAt: new Date() },
      })
      .catch(() => null);
    if (!gate) continue; // نُفِّذ سابقًا لهذا الحدث — تجاهل حتمي

    try {
      // عمق الأتمتة: أحداث تُنشأ من معالِج ترث العمق+1 وتحمل causation — يتجاوز
      // الحد الأقصى → تُكتب dead-letter فورًا بدل التنفيذ (منع حلقة لا صمت).
      const nextDepth = event.automationDepth + 1;
      if (nextDepth > DEFAULT_MAX_DEPTH && event.originatingHandler) {
        await prisma.automationRun.update({
          where: { id: gate.id },
          data: { status: "dead_letter", error: "تجاوز عمق الأتمتة الأقصى", finishedAt: new Date() },
        });
        continue;
      }
      await handler(event);
      await prisma.automationRun.update({
        where: { id: gate.id },
        data: { status: "success", finishedAt: new Date() },
      });
    } catch (error) {
      await prisma.automationRun.update({
        where: { id: gate.id },
        data: {
          status: "failed",
          error: error instanceof Error ? error.message.slice(0, 2000) : String(error),
          finishedAt: new Date(),
        },
      });
      throw error; // يُعلَّم الحدث نفسه فاشلًا (retry/dead_letter في drainOutbox)
    }
  }
}

/** مطابقة معالِج↔حدث بالاتفاقية: اسم المعالِج يبدأ بنوع الحدث (مثلاً
 * "order.created:task-confirmation" يخدم order.created). */
function handlerWantsEvent(handlerName: string, event: DomainEvent): boolean {
  const prefix = handlerName.split(":")[0];
  return prefix === event.eventType;
}

/** الإحصاء للـhealth (P8): عدد الأحداث المعلقة والمهملة. */
export async function outboxHealth(): Promise<{ pending: number; deadLetters: number }> {
  const [pending, deadLetters] = await Promise.all([
    prisma.domainEvent.count({ where: { status: "pending" } }),
    prisma.automationRun.count({ where: { status: "dead_letter" } }),
  ]);
  return { pending, deadLetters };
}

// تصدير نوع مساعد للاستخدام في P7
export type { Prisma };
