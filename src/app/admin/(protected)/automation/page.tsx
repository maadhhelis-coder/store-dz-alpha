import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission, hasPermission } from "@/lib/auth/requirePermission";
import { listDomainEvents } from "@/server/modules/automation/automationService";
import { outboxHealth } from "@/server/modules/automation/outboxDrainer";
import { lastSheetsSyncLogs, sheetsEndpoint } from "@/server/modules/integrations/sheetsSync";
import RetryEventButton from "@/components/admin/crm/RetryEventButton";
import { moment } from "@/components/admin/crm/financeLabels";
import { DomainEventStatus } from "@prisma/client";

export const metadata: Metadata = { title: "الأتمتة — إدارة المتجر", robots: { index: false, follow: false } };

// مراقبة صندوق الأحداث والتكاملات — automation.read؛ الإعادة automation.retry.

const STATUS_LABELS: Record<string, string> = { pending: "معلّق", processing: "قيد المعالجة", processed: "عولج", failed: "فشل (dead-letter)" };
const RUN_LABELS: Record<string, string> = { success: "نجح", failed: "فشل", dead_letter: "مهمل" };

export default async function AutomationPage({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  await requirePermission("automation.read");
  const params = await searchParams;
  const status = params.status && params.status in DomainEventStatus ? (params.status as DomainEventStatus) : undefined;
  const page = Math.max(1, Number(params.page) || 1);
  const [events, health, sheets, canRetry] = await Promise.all([
    listDomainEvents({ status, page, pageSize: 25 }),
    outboxHealth(),
    lastSheetsSyncLogs(5),
    hasPermission("automation.retry"),
  ]);
  const totalPages = Math.max(1, Math.ceil(events.total / events.pageSize));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-bold text-cream">الأتمتة وصندوق الأحداث</h1>
          <p className="text-sm text-cream-dim" data-testid="outbox-health">
            معلّق {health.pending} · تنفيذات مهملة {health.deadLetters} · معالجة يومية بالـcron + نبضة بعد كل كتابة
          </p>
        </div>
        <nav className="flex flex-wrap gap-2 text-xs">
          <Link href="/admin/automation" className={"rounded-lg border px-3 py-1.5 " + (!status ? "gold-gradient text-ink" : "border-gold/25 text-cream-dim")}>الكل</Link>
          {(["pending", "processing", "processed", "failed"] as DomainEventStatus[]).map((s) => (
            <Link key={s} href={"/admin/automation?status=" + s} className={"rounded-lg border px-3 py-1.5 " + (status === s ? "gold-gradient text-ink" : "border-gold/25 text-cream-dim")}>
              {STATUS_LABELS[s]} ({events.byStatus[s] ?? 0})
            </Link>
          ))}
        </nav>
      </header>

      <div className="gold-border bg-ink rounded-xl p-4 text-xs text-cream-dim" data-testid="sheets-status">
        <span className="text-cream font-semibold">Google Sheets:</span>{" "}
        {sheetsEndpoint() ? "مضبوط — مزامنة عبر outbox" : "غير مضبوط (ORDER_SHEETS_ENDPOINT)"}
        {sheets.length > 0 && (
          <ul className="mt-2 space-y-1">
            {sheets.map((l) => (
              <li key={l.id} dir="ltr" className={l.status === "failed" ? "text-red-400" : ""}>
                {moment(l.startedAt)} · {l.status} · {(l.stats as { orderNumber?: string } | null)?.orderNumber ?? ""} {l.error ? "· " + l.error : ""}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="gold-border bg-ink rounded-xl overflow-x-auto">
        <table className="w-full text-xs" data-testid="events-table">
          <thead className="text-cream-dim">
            <tr>
              <th className="px-3 py-2 text-start">الحدث</th>
              <th className="px-3 py-2 text-start">الكيان</th>
              <th className="px-3 py-2 text-start">الحالة</th>
              <th className="px-3 py-2 text-start">محاولات</th>
              <th className="px-3 py-2 text-start">المعالِجات</th>
              <th className="px-3 py-2 text-start">الخطأ</th>
              <th className="px-3 py-2 text-start">الوقت</th>
              <th className="px-3 py-2 text-start">إجراء</th>
            </tr>
          </thead>
          <tbody>
            {events.items.length === 0 && <tr><td colSpan={8} className="px-3 py-8 text-center text-cream-dim">لا أحداث.</td></tr>}
            {events.items.map((e) => (
              <tr key={e.id} className="border-t border-gold/10 text-cream">
                <td className="px-3 py-2" dir="ltr">{e.eventType}</td>
                <td className="px-3 py-2" dir="ltr">{e.entityType}:{e.entityId.slice(0, 8)}</td>
                <td className="px-3 py-2" data-testid={"event-status-" + e.id}>{STATUS_LABELS[e.status] ?? e.status}</td>
                <td className="px-3 py-2" dir="ltr">{e.attempts}</td>
                <td className="px-3 py-2 text-cream-dim" dir="ltr">
                  {e.automationRuns.length === 0 ? "—" : e.automationRuns.map((r) => r.handler + ": " + (RUN_LABELS[r.status] ?? r.status)).join(" · ")}
                </td>
                <td className="px-3 py-2 text-amber-400 max-w-xs truncate">{e.lastError ?? e.automationRuns.find((r) => r.error)?.error ?? "—"}</td>
                <td className="px-3 py-2 text-cream-dim" dir="ltr">{moment(e.createdAt)}</td>
                <td className="px-3 py-2">{canRetry && e.status === "failed" ? <RetryEventButton eventId={e.id} /> : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {totalPages > 1 && (
          <div className="flex justify-between p-3 text-xs text-cream-dim">
            {page > 1 ? <Link href={"/admin/automation?page=" + (page - 1) + (status ? "&status=" + status : "")}>السابق</Link> : <span />}
            <span>صفحة {page} من {totalPages}</span>
            {page < totalPages ? <Link href={"/admin/automation?page=" + (page + 1) + (status ? "&status=" + status : "")}>التالي</Link> : <span />}
          </div>
        )}
      </div>
    </div>
  );
}
