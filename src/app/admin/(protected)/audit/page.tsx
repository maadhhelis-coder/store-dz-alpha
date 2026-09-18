import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission, hasPermission } from "@/lib/auth/requirePermission";
import { listAuditLogs } from "@/server/services/auditService";
import { prisma } from "@/server/db/prisma";

export const metadata: Metadata = {
  title: "سجل التدقيق — إدارة المتجر",
  robots: { index: false, follow: false },
};

// السجل التدقيقي — audit.read حصرًا، قراءة فقط بحكم التصميم (السجل إلحاقي:
// لا API للتعديل أو الحذف إطلاقًا). القيم before/after مُنقّحة وقت الكتابة
// (redactForAudit)، والترتيب حتمي (createdAt ثم id). P8: فلاتر الفاعل/الكيان/
// المدة، عمود الارتباط، اسم الفاعل، وتصدير CSV بنفس الفلاتر (exports.create).

const PAGE_SIZE = 25;

function formatMoment(value: Date): string {
  return value.toISOString().replace("T", " ").slice(0, 19);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; action?: string; entityType?: string; entityId?: string; actorId?: string; dateFrom?: string; dateTo?: string }>;
}) {
  await requirePermission("audit.read");

  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const action = params.action?.trim() || undefined;
  const entityType = params.entityType?.trim() || undefined;
  const entityId = params.entityId?.trim() || undefined;
  const actorId = params.actorId?.trim() && UUID.test(params.actorId.trim()) ? params.actorId.trim() : undefined;
  const dateFrom = params.dateFrom && !Number.isNaN(Date.parse(params.dateFrom)) ? new Date(params.dateFrom) : undefined;
  const dateTo = params.dateTo && !Number.isNaN(Date.parse(params.dateTo)) ? new Date(params.dateTo + "T23:59:59.999Z") : undefined;

  const [{ items, total }, canExport] = await Promise.all([
    listAuditLogs({ action, entityType, entityId, actorId, dateFrom, dateTo, page, pageSize: PAGE_SIZE }),
    hasPermission("exports.create"),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // اسم الفاعل الإداري (بريد) — بلا FK في السجل عمدًا، فيُحلّ هنا للعرض فقط
  const adminIds = [...new Set(items.filter((i) => i.actorType === "admin" && i.actorId).map((i) => i.actorId as string))];
  const admins = adminIds.length ? await prisma.adminUser.findMany({ where: { id: { in: adminIds } }, select: { id: true, email: true } }) : [];
  const emailById = new Map(admins.map((a) => [a.id, a.email]));

  const filters: Record<string, string | undefined> = { action, entityType, entityId, actorId, dateFrom: params.dateFrom, dateTo: params.dateTo };
  const hrefFor = (target: number) => {
    const q = new URLSearchParams({ page: String(target) });
    for (const [k, v] of Object.entries(filters)) if (v) q.set(k, v);
    return `/admin/audit?${q.toString()}`;
  };
  const exportQuery = new URLSearchParams({ entity: "audit" });
  if (action) exportQuery.set("status", action);
  if (dateFrom) exportQuery.set("dateFrom", dateFrom.toISOString());
  if (dateTo) exportQuery.set("dateTo", dateTo.toISOString());

  const input = "rounded-lg border border-gold/25 bg-ink px-3 py-2 text-sm text-cream";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-bold text-cream">سجل التدقيق</h1>
          <p className="text-sm text-cream-dim">
            {total} سجل — إلحاقي فقط، لا يُعدَّل ولا يُحذف · الهواتف والأسرار منقّحة وقت الكتابة
          </p>
        </div>
        {canExport && (
          <a href={"/api/admin/crm/exports?" + exportQuery.toString()} className="border border-gold/25 text-gold text-xs font-semibold px-3 py-2 rounded-lg" data-testid="audit-export">
            تصدير CSV بالفلاتر الحالية
          </a>
        )}
      </header>

      <form action="/admin/audit" className="flex flex-wrap gap-2" data-testid="audit-filters">
        <input type="search" name="action" defaultValue={action} placeholder="الإجراء (status_change…)" className={input} />
        <input type="search" name="entityType" defaultValue={entityType} placeholder="نوع الكيان (order…)" className={input} />
        <input type="search" name="entityId" defaultValue={entityId} placeholder="معرّف الكيان" dir="ltr" className={input} />
        <input type="search" name="actorId" defaultValue={actorId} placeholder="معرّف الفاعل (UUID)" dir="ltr" className={input} />
        <input type="date" name="dateFrom" defaultValue={params.dateFrom} className={input} />
        <input type="date" name="dateTo" defaultValue={params.dateTo} className={input} />
        <button className="gold-gradient text-ink px-4 py-2 rounded-lg text-sm font-semibold">تصفية</button>
      </form>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gold/25 py-16 text-center text-sm text-cream-dim">لا سجلات مطابقة</div>
      ) : (
        <div className="overflow-x-auto gold-border bg-ink rounded-xl">
          <table className="w-full text-sm" data-testid="audit-table">
            <thead className="text-cream-dim text-xs">
              <tr>
                <th className="px-4 py-3 text-start">الوقت (UTC)</th>
                <th className="px-4 py-3 text-start">الإجراء</th>
                <th className="px-4 py-3 text-start">الكيان</th>
                <th className="px-4 py-3 text-start">الفاعل</th>
                <th className="px-4 py-3 text-start">قبل ← بعد</th>
                <th className="px-4 py-3 text-start">السبب</th>
                <th className="px-4 py-3 text-start">الارتباط</th>
              </tr>
            </thead>
            <tbody>
              {items.map((entry) => (
                <tr key={entry.id} className="border-t border-gold/10 align-top">
                  <td className="px-4 py-3 font-mono text-xs text-cream-dim" dir="ltr">{formatMoment(entry.createdAt)}</td>
                  <td className="px-4 py-3 font-semibold text-cream">{entry.action}</td>
                  <td className="px-4 py-3 text-xs text-cream">
                    {entry.entityType}
                    {entry.entityId && (
                      <Link href={"/admin/audit?entityId=" + encodeURIComponent(entry.entityId)} className="block font-mono text-cream-dim" dir="ltr">
                        {entry.entityId.slice(0, 8)}
                      </Link>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-cream">
                    {entry.actorType}
                    {entry.actorId && (
                      <span className="block font-mono text-cream-dim" dir="ltr">
                        {emailById.get(entry.actorId) ?? entry.actorId.slice(0, 8)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-cream-dim">
                    <span dir="ltr" className="block max-w-md truncate font-mono">
                      {JSON.stringify(entry.before ?? null)} ← {JSON.stringify(entry.after ?? null)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-cream-dim">{entry.reason ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs text-cream-dim" dir="ltr">{entry.correlationId?.slice(0, 8) ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <nav className="flex items-center justify-between text-sm">
          {page > 1 ? <Link href={hrefFor(page - 1)} className="rounded-lg border border-gold/25 px-3 py-1.5 text-gold">السابق</Link> : <span />}
          <span className="text-xs text-cream-dim">صفحة {page} من {totalPages}</span>
          {page < totalPages ? <Link href={hrefFor(page + 1)} className="rounded-lg border border-gold/25 px-3 py-1.5 text-gold">التالي</Link> : <span />}
        </nav>
      )}
    </div>
  );
}
