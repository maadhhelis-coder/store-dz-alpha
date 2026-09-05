import { prisma } from "@/server/db/prisma";
import { acquireJobLock, releaseJobLock } from "@/lib/jobLock";
import { raiseSystemAlert } from "@/server/modules/alerts/alertsService";
import { redactErrorMessage } from "@/lib/redact";

// مشغّل المهام المجدولة — قفل واحد، سجل واحد في job_runs، تنبيه عند الفشل.
// لا يبتلع أي خطأ: يسجّله ويرفع التنبيه ثم يعيد رميه للمستدعي كما هو.
// التشغيل المرفوض بالقفل لا يكتب صف job_runs (لا تنفيذ = لا تشغيلة).

const DEFAULT_LOCK_TTL_SECONDS = 600;

export type JobOutcome<T> =
  | { status: "completed"; jobRunId: string; durationMs: number; result: T }
  | { status: "skipped_locked" };

export async function runJob<T>(
  job: string,
  fn: () => Promise<T>,
  options: { trigger?: string; lockTtlSeconds?: number } = {},
): Promise<JobOutcome<T>> {
  const lock = await acquireJobLock(job, options.lockTtlSeconds ?? DEFAULT_LOCK_TTL_SECONDS);
  if (!lock) return { status: "skipped_locked" };

  const startedAt = new Date();
  const run = await prisma.jobRun.create({
    data: { job, status: "running", trigger: options.trigger ?? "cron", startedAt },
    select: { id: true },
  });

  try {
    const result = await fn();
    const durationMs = Date.now() - startedAt.getTime();
    await prisma.jobRun.update({
      where: { id: run.id },
      data: { status: "success", finishedAt: new Date(), durationMs },
    });
    return { status: "completed", jobRunId: run.id, durationMs, result };
  } catch (error) {
    const durationMs = Date.now() - startedAt.getTime();
    const message = redactErrorMessage(error instanceof Error ? error.message : String(error));
    await prisma.jobRun.update({
      where: { id: run.id },
      data: { status: "failed", finishedAt: new Date(), durationMs, error: message },
    });
    // التنبيه لا يرمي أبدًا (alertsService) فلا يُخفي الخطأ الأصلي المُعاد رميه أدناه
    await raiseSystemAlert({
      type: "job_failed",
      severity: "high",
      message: `فشل تشغيل المهمة ${job}: ${message}`,
      entityType: "job_run",
      entityId: run.id,
      metadata: { job, durationMs },
    });
    throw error;
  } finally {
    await releaseJobLock(lock).catch(() => {});
  }
}
