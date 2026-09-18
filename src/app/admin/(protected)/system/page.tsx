import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission, hasPermission } from "@/lib/auth/requirePermission";
import { getSystemStatus } from "@/server/modules/observability/systemStatusService";
import { getCrmSetting } from "@/server/modules/settings/crmSettingsService";
import ExportsPanel from "@/components/admin/crm/ExportsPanel";

export const metadata: Metadata = { title: "حالة النظام — إدارة المتجر", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

// حالة النظام والتصدير (P8) — settings.read. أرقام تشغيلية قابلة للفعل فقط
// (ما يحتاج تدخلًا يظهر بالأحمر مع رابط الشاشة المختصة)، بلا أسرار.

function Card({ title, ok, children, testId }: { title: string; ok: boolean; children: React.ReactNode; testId: string }) {
  return (
    <div className={"gold-border bg-ink rounded-xl p-4 space-y-1 " + (ok ? "" : "border-red-500/60")} data-testid={testId}>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-cream">{title}</h2>
        <span className={"text-xs font-semibold " + (ok ? "text-emerald-400" : "text-red-400")}>{ok ? "سليم" : "يحتاج تدخلًا"}</span>
      </div>
      <div className="text-xs text-cream-dim space-y-0.5">{children}</div>
    </div>
  );
}

export default async function SystemPage() {
  await requirePermission("settings.read");
  const [status, maxRows, canExport] = await Promise.all([getSystemStatus(), getCrmSetting("export_max_rows"), hasPermission("exports.create")]);
  const failedJobs = status.jobs.filter((j) => j.status !== "success");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-xl font-bold text-cream">حالة النظام</h1>
        <p className="text-sm text-cream-dim" dir="ltr">{status.generatedAt} · /api/health public = db ping only</p>
      </header>

      {status.errors.length > 0 && (
        <div className="rounded-xl border border-red-500/60 bg-ink p-3 text-xs text-red-400" data-testid="status-errors">
          تعذّر جمع بعض المؤشرات: {status.errors.join(" · ")}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card title="قاعدة البيانات" ok={status.db.ok} testId="card-db">
          <p>{status.db.ok ? "متصلة · " + status.db.latencyMs + "ms" : "غير متاحة"}</p>
        </Card>
        <Card title="الهجرات (Prisma)" ok={status.migrations.failed === 0} testId="card-migrations">
          <p>مطبّقة: {status.migrations.applied} · فاشلة/معلّقة: {status.migrations.failed}</p>
          <p dir="ltr" className="font-mono truncate">{status.migrations.last ?? "—"}</p>
        </Card>
        <Card title="صندوق الأحداث" ok={status.outbox.failedEvents === 0 && status.outbox.deadLetters === 0} testId="card-outbox">
          <p>معلّق: {status.outbox.pending}{status.outbox.oldestPendingAgeMin !== null && " (الأقدم منذ " + status.outbox.oldestPendingAgeMin + " د)"}</p>
          <p>أحداث فاشلة: {status.outbox.failedEvents} · تنفيذات مهملة: {status.outbox.deadLetters}</p>
          <Link href="/admin/automation?status=failed" className="text-gold">لوحة الأتمتة ←</Link>
        </Card>
        <Card title="التواصل" ok={status.communications.failed7d === 0} testId="card-comms">
          <p>في الانتظار: {status.communications.queued} · فشل خلال 7 أيام: {status.communications.failed7d}</p>
        </Card>
        <Card title="Google Sheets" ok={status.sheets.failed24h === 0} testId="card-sheets">
          <p>{status.sheets.configured ? "مضبوط" : "غير متاح — يحتاج إلى إعداد (ORDER_SHEETS_ENDPOINT)"}</p>
          <p>فشل خلال 24 ساعة: {status.sheets.failed24h} · آخر تشغيلة: {status.sheets.lastStatus ?? "—"} <span dir="ltr">{status.sheets.lastAt?.slice(0, 16).replace("T", " ") ?? ""}</span></p>
        </Card>
        <Card title="المهام الدورية" ok={failedJobs.length === 0} testId="card-jobs">
          {status.jobs.length === 0 && <p>لا تشغيلات مسجّلة بعد</p>}
          {status.jobs.map((j) => (
            <p key={j.job} dir="ltr" className={j.status === "success" ? "" : "text-red-400"}>
              {j.job} · {j.status} · {j.startedAt.slice(0, 16).replace("T", " ")}{j.error ? " · " + j.error : ""}
            </p>
          ))}
        </Card>
      </div>

      <section className="space-y-2">
        <h2 className="font-display font-semibold text-gold">تنبيهات النظام المفتوحة ({status.alerts.open})</h2>
        {status.alerts.recent.length === 0 ? (
          <p className="text-xs text-cream-dim" data-testid="alerts-empty">لا تنبيهات مفتوحة</p>
        ) : (
          <ul className="gold-border bg-ink rounded-xl divide-y divide-gold/10 text-xs" data-testid="alerts-list">
            {status.alerts.recent.map((a) => (
              <li key={a.id} className="px-4 py-2 flex flex-wrap gap-2">
                <span className={a.severity === "critical" || a.severity === "high" ? "text-red-400" : "text-gold"}>{a.severity}</span>
                <span className="font-mono text-cream-dim" dir="ltr">{a.type}</span>
                <span className="text-cream">{a.message}</span>
                <span className="text-cream-dim" dir="ltr">{a.createdAt.slice(0, 16).replace("T", " ")}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {canExport && (
        <section className="space-y-2">
          <h2 className="font-display font-semibold text-gold">التصدير</h2>
          <ExportsPanel maxRows={maxRows} />
        </section>
      )}
    </div>
  );
}
