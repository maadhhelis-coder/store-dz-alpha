import { prisma } from "@/server/db/prisma";
import { outboxHealth } from "@/server/modules/automation/outboxDrainer";
import { sheetsEndpoint, SHEETS_INTEGRATION } from "@/server/modules/integrations/sheetsSync";
import { listAlerts } from "@/server/modules/alerts/alertsService";

// حالة النظام التشغيلية (P8) — تجميع للقراءة فقط فوق الجداول القائمة، بلا أسرار:
// قاعدة البيانات، هجرات Prisma، صندوق الأحداث، التواصل، Google Sheets، المهام
// الدورية، وتنبيهات النظام المفتوحة. /api/health العام يبقى {status} فقط؛ هذه
// التفاصيل خلف settings.read.

const DAY_MS = 86_400_000;

export type SystemStatus = {
  generatedAt: string;
  db: { ok: boolean; latencyMs: number | null };
  migrations: { applied: number; last: string | null; failed: number };
  outbox: { pending: number; failedEvents: number; deadLetters: number; oldestPendingAgeMin: number | null };
  communications: { queued: number; failed7d: number };
  sheets: { configured: boolean; failed24h: number; lastStatus: string | null; lastAt: string | null };
  jobs: { job: string; status: string; startedAt: string; durationMs: number | null; error: string | null }[];
  alerts: { open: number; bySeverity: Record<string, number>; recent: { id: string; severity: string; type: string; message: string; createdAt: string }[] };
  /** خطأ تجميعي إن فشل أي مصدر — الحالة تُعرض جزئيًا بدل 500 كامل */
  errors: string[];
};

export async function getSystemStatus(): Promise<SystemStatus> {
  const now = Date.now();
  const errors: string[] = [];
  const guard = async <T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn();
    } catch (error) {
      errors.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
      return fallback;
    }
  };

  const db = await guard<SystemStatus["db"]>(
    "db",
    async () => {
      const t = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      return { ok: true, latencyMs: Date.now() - t };
    },
    { ok: false, latencyMs: null },
  );

  const [migrations, outbox, communications, sheets, jobs, alerts] = await Promise.all([
    guard(
      "migrations",
      async () => {
        const [row] = await prisma.$queryRaw<{ applied: bigint; failed: bigint; last: string | null }[]>`
          SELECT count(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) AS applied,
                 count(*) FILTER (WHERE finished_at IS NULL AND rolled_back_at IS NULL) AS failed,
                 (SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1) AS last
          FROM _prisma_migrations`;
        return { applied: Number(row?.applied ?? 0), failed: Number(row?.failed ?? 0), last: row?.last ?? null };
      },
      { applied: 0, failed: 0, last: null },
    ),
    guard(
      "outbox",
      async () => {
        const [h, failedEvents, oldest] = await Promise.all([
          outboxHealth(),
          prisma.domainEvent.count({ where: { status: "failed" } }),
          prisma.domainEvent.findFirst({ where: { status: "pending" }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
        ]);
        return { ...h, failedEvents, oldestPendingAgeMin: oldest ? Math.floor((now - oldest.createdAt.getTime()) / 60_000) : null };
      },
      { pending: 0, deadLetters: 0, failedEvents: 0, oldestPendingAgeMin: null },
    ),
    guard(
      "communications",
      async () => {
        const [queued, failed7d] = await Promise.all([
          prisma.communication.count({ where: { status: "queued" } }),
          prisma.communication.count({ where: { status: "failed", createdAt: { gte: new Date(now - 7 * DAY_MS) } } }),
        ]);
        return { queued, failed7d };
      },
      { queued: 0, failed7d: 0 },
    ),
    guard(
      "sheets",
      async () => {
        const [failed24h, last] = await Promise.all([
          prisma.integrationSyncLog.count({ where: { integration: SHEETS_INTEGRATION, status: "failed", startedAt: { gte: new Date(now - DAY_MS) } } }),
          prisma.integrationSyncLog.findFirst({ where: { integration: SHEETS_INTEGRATION }, orderBy: { startedAt: "desc" }, select: { status: true, startedAt: true } }),
        ]);
        return { configured: sheetsEndpoint() !== null, failed24h, lastStatus: last?.status ?? null, lastAt: last?.startedAt.toISOString() ?? null };
      },
      { configured: false, failed24h: 0, lastStatus: null, lastAt: null },
    ),
    guard(
      "jobs",
      async () =>
        (
          await prisma.$queryRaw<{ job: string; status: string; started_at: Date; duration_ms: number | null; error: string | null }[]>`
            SELECT DISTINCT ON (job) job, status, started_at, duration_ms, error
            FROM job_runs ORDER BY job, started_at DESC`
        ).map((j) => ({ job: j.job, status: j.status, startedAt: j.started_at.toISOString(), durationMs: j.duration_ms, error: j.error })),
      [],
    ),
    guard(
      "alerts",
      async () => {
        const [grouped, recent] = await Promise.all([
          prisma.systemAlert.groupBy({ by: ["severity"], where: { resolvedAt: null }, _count: { _all: true } }),
          listAlerts({ status: "open", page: 1, pageSize: 10 }),
        ]);
        const bySeverity = Object.fromEntries(grouped.map((g) => [g.severity, g._count._all]));
        return {
          open: grouped.reduce((n, g) => n + g._count._all, 0),
          bySeverity,
          recent: recent.items.map((a) => ({ id: a.id, severity: a.severity, type: a.type, message: a.message, createdAt: a.createdAt.toISOString() })),
        };
      },
      { open: 0, bySeverity: {}, recent: [] },
    ),
  ]);

  return { generatedAt: new Date(now).toISOString(), db, migrations, outbox, communications, sheets, jobs, alerts, errors };
}
