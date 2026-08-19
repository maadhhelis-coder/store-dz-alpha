import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import type { DateWindow } from "@/server/repositories/analyticsRepository";
import type { WebVitalInput } from "@/lib/validation/webVitalSchema";

export function recordWebVital(input: WebVitalInput) {
  return prisma.webVitalMetric.create({
    data: {
      name: input.name,
      value: input.value,
      rating: input.rating,
      path: input.path,
      visitorId: input.visitorId,
    },
  });
}

function dateFilterSql(window: DateWindow) {
  const parts: Prisma.Sql[] = [];
  if (window.start) parts.push(Prisma.sql`AND created_at >= ${window.start}`);
  if (window.end) parts.push(Prisma.sql`AND created_at < ${window.end}`);
  return parts.length ? Prisma.join(parts, " ") : Prisma.empty;
}

const METRIC_NAMES = ["LCP", "INP", "CLS", "TTFB", "FCP"] as const;
export type WebVitalName = (typeof METRIC_NAMES)[number];

type MetricAggRow = {
  name: string;
  p75: number | null;
  sampleCount: bigint;
  goodCount: bigint;
  needsImprovementCount: bigint;
  poorCount: bigint;
};

export type WebVitalSummaryRow = {
  name: WebVitalName;
  p75: number | null;
  sampleCount: number;
  goodCount: number;
  needsImprovementCount: number;
  poorCount: number;
};

// p75 هو المقياس القياسي الرسمي لتجميع Core Web Vitals (وليس المتوسط الحسابي) — يعكس تجربة
// الغالبية العظمى من الزوّار بلا تحيّز من قيم متطرّفة نادرة (اتصال بطيء جدًا مرّة واحدة مثلًا).
export async function getWebVitalsSummary(window: DateWindow): Promise<WebVitalSummaryRow[]> {
  const dateFilter = dateFilterSql(window);

  const rows = await prisma.$queryRaw<MetricAggRow[]>`
    SELECT name,
           percentile_cont(0.75) WITHIN GROUP (ORDER BY value) AS p75,
           COUNT(*)::bigint AS "sampleCount",
           COUNT(*) FILTER (WHERE rating = 'good')::bigint AS "goodCount",
           COUNT(*) FILTER (WHERE rating = 'needs-improvement')::bigint AS "needsImprovementCount",
           COUNT(*) FILTER (WHERE rating = 'poor')::bigint AS "poorCount"
    FROM web_vital_metrics
    WHERE 1=1 ${dateFilter}
    GROUP BY name
  `;

  const byName = new Map(rows.map((r) => [r.name, r]));

  return METRIC_NAMES.map((name) => {
    const row = byName.get(name);
    return {
      name,
      p75: row?.p75 ?? null,
      sampleCount: Number(row?.sampleCount ?? 0),
      goodCount: Number(row?.goodCount ?? 0),
      needsImprovementCount: Number(row?.needsImprovementCount ?? 0),
      poorCount: Number(row?.poorCount ?? 0),
    };
  });
}

export function deleteWebVitalMetricsOlderThan(cutoff: Date) {
  return prisma.webVitalMetric.deleteMany({ where: { createdAt: { lt: cutoff } } });
}
