import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/requirePermission";
import { formatDate } from "@/lib/format";
import { listCustomers } from "@/server/modules/customers/customerQueryService";
import { RISK_LABELS, SEGMENT_LABELS } from "@/components/admin/crm/customerLabels";

export const metadata: Metadata = {
  title: "العملاء — إدارة المتجر",
  robots: { index: false, follow: false },
};

// قائمة العملاء — customers.read حصرًا (لا requireAdmin). الاستعلام نفسه الذي
// يخدم GET /api/admin/crm/customers (listCustomers) فلا تختلف الشاشة عن الـAPI
// في ترتيب أو فلترة أو عدّ. العملاء لا يُنشأون من طلبات isTest أصلًا.

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string }>;
}) {
  await requirePermission("customers.read");

  const params = await searchParams;
  const search = params.search?.trim() ?? "";
  const { items, page, total, totalPages } = await listCustomers({
    page: Number(params.page) || 1,
    filters: { search: search || null },
  });

  const pageHref = (target: number) =>
    `/admin/customers?page=${target}${search ? `&search=${encodeURIComponent(search)}` : ""}`;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">العملاء</h1>
          <p className="text-sm text-neutral-500">
            {total} عميل — هوية موحّدة بمطابقة الهاتف الحتمية (لا تكرار)
          </p>
        </div>
        <form action="/admin/customers" className="flex gap-2">
          <input
            type="search"
            name="search"
            defaultValue={search}
            placeholder="بحث بالاسم أو الهاتف…"
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
          />
          <button className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white">
            بحث
          </button>
        </form>
      </header>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 py-16 text-center text-sm text-neutral-500">
          {search
            ? "لا نتائج مطابقة"
            : "لا عملاء بعد — يبدأ سجل العملاء بأول طلب إنتاجي (بيانات الاختبار مستثناة)"}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-500">
              <tr>
                <th className="px-4 py-3 text-start">العميل</th>
                <th className="px-4 py-3 text-start">الهاتف</th>
                <th className="px-4 py-3 text-start">البلدية</th>
                <th className="px-4 py-3 text-start">الطلبات</th>
                <th className="px-4 py-3 text-start">القطاعات</th>
                <th className="px-4 py-3 text-start">المخاطرة</th>
                <th className="px-4 py-3 text-start">آخر طلب</th>
              </tr>
            </thead>
            <tbody>
              {items.map((customer) => (
                <tr key={customer.id} className="border-t border-neutral-100">
                  <td className="px-4 py-3 font-semibold">
                    <Link href={`/admin/customers/${customer.id}`} className="hover:underline">
                      {customer.fullName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono" dir="ltr">
                    {customer.phoneMasked}
                  </td>
                  <td className="px-4 py-3">{customer.commune ?? "—"}</td>
                  <td className="px-4 py-3">{customer.ordersCount}</td>
                  <td className="px-4 py-3 text-xs text-neutral-500">
                    {customer.segments.length === 0
                      ? "—"
                      : customer.segments.map((s) => SEGMENT_LABELS[s] ?? s).join("، ")}
                  </td>
                  <td className="px-4 py-3">
                    {RISK_LABELS[customer.riskLevel] ?? customer.riskLevel}
                  </td>
                  <td className="px-4 py-3 text-neutral-500">
                    {customer.lastOrderAt ? formatDate(customer.lastOrderAt.toISOString()) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <nav className="flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className="rounded-lg border border-neutral-300 px-3 py-1.5">
              السابق
            </Link>
          ) : (
            <span />
          )}
          <span className="text-xs text-neutral-400">
            صفحة {page} من {totalPages}
          </span>
          {page < totalPages ? (
            <Link href={pageHref(page + 1)} className="rounded-lg border border-neutral-300 px-3 py-1.5">
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
