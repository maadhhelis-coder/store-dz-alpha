import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/requirePermission";
import { listAuditLogs } from "@/server/services/auditService";

export const metadata: Metadata = {
  title: "سجل التدقيق — إدارة المتجر",
  robots: { index: false, follow: false },
};

// السجل التدقيقي — audit.read حصرًا، قراءة فقط بحكم التصميم (السجل إلحاقي:
// لا API للتعديل أو الحذف إطلاقًا). كان يُكتب في كل مكان بلا أي شاشة تقرؤه.
// القيم before/after مُنقّحة وقت الكتابة، والترتيب حتمي (createdAt ثم id).

const PAGE_SIZE = 25;

function formatMoment(value: Date): string {
  return value.toISOString().replace("T", " ").slice(0, 19);
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; action?: string; entityType?: string }>;
}) {
  await requirePermission("audit.read");

  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const action = params.action?.trim() || undefined;
  const entityType = params.entityType?.trim() || undefined;

  const { items, total } = await listAuditLogs({ action, entityType, page, pageSize: PAGE_SIZE });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const hrefFor = (target: number) => {
    const q = new URLSearchParams({ page: String(target) });
    if (action) q.set("action", action);
    if (entityType) q.set("entityType", entityType);
    return `/admin/audit?${q.toString()}`;
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">سجل التدقيق</h1>
          <p className="text-sm text-neutral-500">
            {total} سجل — إلحاقي فقط، لا يُعدَّل ولا يُحذف
          </p>
        </div>
        <form action="/admin/audit" className="flex flex-wrap gap-2">
          <input
            type="search"
            name="action"
            defaultValue={action}
            placeholder="الإجراء (مثال: status_change)"
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
          />
          <input
            type="search"
            name="entityType"
            defaultValue={entityType}
            placeholder="نوع الكيان (order، customer…)"
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
          />
          <button className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white">
            تصفية
          </button>
        </form>
      </header>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 py-16 text-center text-sm text-neutral-500">
          لا سجلات مطابقة
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-500">
              <tr>
                <th className="px-4 py-3 text-start">الوقت (UTC)</th>
                <th className="px-4 py-3 text-start">الإجراء</th>
                <th className="px-4 py-3 text-start">الكيان</th>
                <th className="px-4 py-3 text-start">الفاعل</th>
                <th className="px-4 py-3 text-start">قبل ← بعد</th>
                <th className="px-4 py-3 text-start">السبب</th>
              </tr>
            </thead>
            <tbody>
              {items.map((entry) => (
                <tr key={entry.id} className="border-t border-neutral-100 align-top">
                  <td className="px-4 py-3 font-mono text-xs text-neutral-500" dir="ltr">
                    {formatMoment(entry.createdAt)}
                  </td>
                  <td className="px-4 py-3 font-semibold">{entry.action}</td>
                  <td className="px-4 py-3 text-xs">
                    {entry.entityType}
                    {entry.entityId && (
                      <span className="block font-mono text-neutral-400" dir="ltr">
                        {entry.entityId.slice(0, 8)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {entry.actorType}
                    {entry.actorId && (
                      <span className="block font-mono text-neutral-400" dir="ltr">
                        {entry.actorId.slice(0, 8)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-neutral-600">
                    <span dir="ltr" className="block max-w-md truncate font-mono">
                      {JSON.stringify(entry.before ?? null)} ← {JSON.stringify(entry.after ?? null)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-neutral-500">{entry.reason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <nav className="flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link href={hrefFor(page - 1)} className="rounded-lg border border-neutral-300 px-3 py-1.5">
              السابق
            </Link>
          ) : (
            <span />
          )}
          <span className="text-xs text-neutral-400">
            صفحة {page} من {totalPages}
          </span>
          {page < totalPages ? (
            <Link href={hrefFor(page + 1)} className="rounded-lg border border-neutral-300 px-3 py-1.5">
              التالي
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
