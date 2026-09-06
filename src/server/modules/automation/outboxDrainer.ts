import { after } from "next/server";
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

// تسجيل المعالِجات: استيراد ديناميكي مرة واحدة لكل نسخة تشغيل. ديناميكي لأن
// المعالِج يستورد هذه الوحدة (دورة عند الاستيراد الساكن)، وإلزامي لأن أي مسار
// يصرّف — نبضة after() أو cron — لو لم يستورد المعالِجات لعلّم الأحداث
// processed بلا أي تنفيذ. الفشل يُرمى بصوت عالٍ ولا يُبتلع.
let handlersRegistered = false;
async function ensureHandlersRegistered(): Promise<void> {
  if (handlersRegistered) return;
  await import("@/server/modules/shipping/shipmentDispatch");
  handlersRegistered = true;
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
  await ensureHandlersRegistered();
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

/** نبضة زمن-منخفض بعد التزام معاملة كتبت حدثًا: تصريف بعد إرسال الرد.
 *
 * لا نستعمل runAfterResponse هنا عمدًا رغم وجوده: احتياطه هو التنفيذ الفوري
 * خارج نطاق الطلب، وتصريف الصندوق خارج نطاق طلب هو **عمل الـcron بالضبط** —
 * تشغيله من داخل خدمة تُستدعى مباشرة (cron، اختبار، مهمة خلفية) يجعل التصريف
 * غير حتمي. فداخل معالج طلب: after(). خارجه: لا شيء، والـcron كل 5 دقائق يتكفّل.
 *
 * التزامن آمن أصلًا: claim CAS على lease يضمن مطالبًا واحدًا لكل حدث. */
/** تصريف متكرر حتى يفرغ الصندوق أو ينفد سقف الجولات.
 *
 * دفعة drainOutbox الواحدة 20 حدثًا والترتيب FIFO، فمع أي تراكم لا يصل الحدث
 * الجديد أبدًا في تصريفة واحدة — أُثبت في CI: نبضة أعادت processed=20 بينما
 * حدث الشحنة المنشأة للتو لم يُعالَج. تشغيلة واحدة (نبضة أو cron) يجب أن
 * تستنزف ما تستطيع، لا دفعة واحدة. */
export async function drainOutboxUntilEmpty(
  maxRounds = 10,
): Promise<{ processed: number; failed: number; rounds: number }> {
  let processed = 0;
  let failed = 0;
  let rounds = 0;
  for (; rounds < maxRounds; rounds++) {
    const result = await drainOutbox();
    processed += result.processed;
    failed += result.failed;
    if (result.processed === 0 && result.failed === 0) break;
  }
  return { processed, failed, rounds };
}

export function nudgeOutbox(): void {
  try {
    after(async () => {
      try {
        const result = await drainOutboxUntilEmpty();
        console.log(
          JSON.stringify({ event: "outbox_nudge_drained", ...result, timestamp: new Date().toISOString() }),
        );
      } catch (error) {
        console.error(
          JSON.stringify({
            event: "outbox_nudge_failed",
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString(),
          }),
        );
      }
    });
  } catch {
    // خارج نطاق طلب — لا نبضة، والـcron يتكفّل
  }
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
    // بوابة الـidempotency: **النجاح السابق وحده** يمنع إعادة التنفيذ.
    //
    // كانت البوابة تُنشأ بحالة success قبل التنفيذ، فأي فشل يجعل INSERT التالي
    // ينتهك UNIQUE(event_id, handler) ⇒ تخطٍّ صامت ⇒ الحدث يُعلَّم processed بلا
    // تنفيذ. أي: فشل عابر واحد = أثر خارجي لا يقع أبدًا (أُثبت باختبار).
    //
    // التزامن آمن بلا حارس إضافي: claim CAS على lease الحدث يضمن أن عاملًا
    // واحدًا فقط يعالج هذا الحدث، فأي سجل غير ناجح هنا هو محاولة سابقة انتهت
    // (أو عامل انهار) — يُستأنف. dead_letter منتهٍ بالسياسة فلا يُستأنف.
    const resumed = await prisma.automationRun.updateMany({
      where: {
        eventId: event.id,
        handler: handlerName,
        status: { notIn: ["success", "dead_letter"] },
      },
      data: { attempts: { increment: 1 }, error: null, startedAt: new Date(), finishedAt: null },
    });

    if (resumed.count === 0) {
      // لا سجل بعد ⇒ ننشئه بحالة failed (= "حوول ولم ينجح") ونرقّيه عند النجاح
      const created = await prisma.automationRun
        .create({
          data: { eventId: event.id, handler: handlerName, status: "failed", startedAt: new Date() },
        })
        .catch(() => null);
      // فشل الإنشاء ⇒ السجل موجود وهو success أو dead_letter ⇒ تخطٍّ حتمي
      if (!created) continue;
    }

    try {
      // عمق الأتمتة: أحداث تُنشأ من معالِج ترث العمق+1 وتحمل causation — يتجاوز
      // الحد الأقصى → تُكتب dead-letter فورًا بدل التنفيذ (منع حلقة لا صمت).
      const nextDepth = event.automationDepth + 1;
      if (nextDepth > DEFAULT_MAX_DEPTH && event.originatingHandler) {
        await prisma.automationRun.update({
          where: { eventId_handler: { eventId: event.id, handler: handlerName } },
          data: { status: "dead_letter", error: "تجاوز عمق الأتمتة الأقصى", finishedAt: new Date() },
        });
        continue;
      }
      await handler(event);
      await prisma.automationRun.update({
        where: { eventId_handler: { eventId: event.id, handler: handlerName } },
        data: { status: "success", finishedAt: new Date() },
      });
    } catch (error) {
      await prisma.automationRun.update({
        where: { eventId_handler: { eventId: event.id, handler: handlerName } },
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
