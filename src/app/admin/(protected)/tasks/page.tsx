import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/requirePermission";
import { formatDate } from "@/lib/format";
import { listTasks, tasksOverdueCount } from "@/server/modules/tasks/tasksService";
import CompleteTaskButton from "@/components/admin/crm/CompleteTaskButton";
import { TaskStatus, TaskType } from "@prisma/client";

export const metadata: Metadata = {
  title: "المهام — إدارة المتجر",
  robots: { index: false, follow: false },
};

// قائمة المهام — tasks.read حصرًا. المهام تُنشأ آليًا (مراجعة احتيال عالية
// الخطورة، تعارض فصل دمج) وكانت بلا أي شاشة: صفوف لا يراها بشر. الترتيب حتمي
// (dueAt ثم id) من الخدمة نفسها، والحجم مسقوف من الخادم.

const TYPE_LABELS: Record<string, string> = {
  confirm_order: "تأكيد طلب",
  prepare_order: "تجهيز طلب",
  follow_up: "متابعة",
  manual_review: "مراجعة يدوية",
  logistics_review: "مراجعة لوجستية",
  customer_support: "دعم العملاء",
};

const STATUS_LABELS: Record<string, string> = {
  open: "مفتوحة",
  in_progress: "قيد التنفيذ",
  done: "منجزة",
  cancelled: "ملغاة",
};

const PAGE_SIZE = 20;

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string; type?: string; overdue?: string }>;
}) {
  await requirePermission("tasks.read");

  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const status = params.status && params.status in TaskStatus ? (params.status as TaskStatus) : undefined;
  const type = params.type && params.type in TaskType ? (params.type as TaskType) : undefined;
  const overdueOnly = params.overdue === "true";

  const [{ items, total }, overdue] = await Promise.all([
    listTasks({ status, type, overdueOnly, page, pageSize: PAGE_SIZE }),
    tasksOverdueCount(),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const filterHref = (extra: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    if (status) q.set("status", status);
    if (type) q.set("type", type);
    if (overdueOnly) q.set("overdue", "true");
    for (const [k, v] of Object.entries(extra)) {
      if (v === undefined) q.delete(k);
      else q.set(k, v);
    }
    const s = q.toString();
    return `/admin/tasks${s ? `?${s}` : ""}`;
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">المهام</h1>
          <p className="text-sm text-neutral-500">
            {total} مهمة — {overdue} متأخرة عن موعدها
          </p>
        </div>
        <nav className="flex flex-wrap gap-2 text-sm">
          <Link
            href="/admin/tasks"
            className={`rounded-lg border px-3 py-1.5 ${!status && !overdueOnly ? "bg-black text-white" : "border-neutral-300"}`}
          >
            الكل
          </Link>
          <Link
            href={filterHref({ status: "open", overdue: undefined })}
            className={`rounded-lg border px-3 py-1.5 ${status === "open" ? "bg-black text-white" : "border-neutral-300"}`}
          >
            مفتوحة
          </Link>
          <Link
            href={filterHref({ overdue: "true", status: undefined })}
            className={`rounded-lg border px-3 py-1.5 ${overdueOnly ? "bg-black text-white" : "border-neutral-300"}`}
          >
            المتأخرة
          </Link>
        </nav>
      </header>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 py-16 text-center text-sm text-neutral-500">
          لا مهام مطابقة — المهام تُنشأ آليًا عند مراجعة احتيال أو تعارض فصل دمج
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-500">
              <tr>
                <th className="px-4 py-3 text-start">النوع</th>
                <th className="px-4 py-3 text-start">الحالة</th>
                <th className="px-4 py-3 text-start">الأولوية</th>
                <th className="px-4 py-3 text-start">الاستحقاق</th>
                <th className="px-4 py-3 text-start">المصدر</th>
                <th className="px-4 py-3 text-start">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {items.map((task) => {
                const isOverdue = task.isOverdue;
                return (
                  <tr key={task.id} className="border-t border-neutral-100">
                    <td className="px-4 py-3 font-semibold">
                      {TYPE_LABELS[task.type] ?? task.type}
                      {task.customerId && (
                        <Link
                          href={`/admin/customers/${task.customerId}`}
                          className="ms-2 text-xs font-normal text-neutral-500 hover:underline"
                        >
                          العميل
                        </Link>
                      )}
                    </td>
                    <td className="px-4 py-3">{STATUS_LABELS[task.status] ?? task.status}</td>
                    <td className="px-4 py-3">{task.priority}</td>
                    <td className={`px-4 py-3 ${isOverdue ? "font-semibold text-red-600" : "text-neutral-500"}`}>
                      {task.dueAt ? formatDate(task.dueAt.toISOString()) : "—"}
                      {isOverdue && " (متأخرة)"}
                    </td>
                    <td className="px-4 py-3 text-xs text-neutral-500">{task.source}</td>
                    <td className="px-4 py-3">
                      {task.status === "open" || task.status === "in_progress" ? (
                        <CompleteTaskButton taskId={task.id} />
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <nav className="flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link href={filterHref({ page: String(page - 1) })} className="rounded-lg border border-neutral-300 px-3 py-1.5">
              السابق
            </Link>
          ) : (
            <span />
          )}
          <span className="text-xs text-neutral-400">
            صفحة {page} من {totalPages}
          </span>
          {page < totalPages ? (
            <Link href={filterHref({ page: String(page + 1) })} className="rounded-lg border border-neutral-300 px-3 py-1.5">
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
