import type { Metadata } from "next";
import { prisma } from "@/server/db/prisma";
import { requirePermission } from "@/lib/auth/requirePermission";
import { maskPhoneForDisplay } from "@/lib/phone";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "العملاء — إدارة المتجر",
  robots: { index: false, follow: false },
};

// قائمة العملاء الأساسية (P2) — قراءة فقط، customers.read حصرًا (لا requireAdmin).
// العملاء لا يُنشأون من طلبات isTest أصلًا (قيد قاعدة بيانات)، فالقائمة نظيفة
// بطبيعتها. البحث: بالاسم (contains) أو بالهاتف القانوني (exact بعد التطبيع —
// لا contains واسع على الجداول الكبيرة، سياسة 3.19). الـ360 الكامل في P3.

const PAGE_SIZE = 20;

const RISK_LABELS: Record<string, string> = {
  low: "منخفضة",
  medium: "متوسطة",
  high: "مرتفعة",
  very_high: "مرتفعة جدًا",
};

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string }>;
}) {
  await requirePermission("customers.read");

  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const search = params.search?.trim() ?? "";

  // الهاتف: طبّع ثم ابحث بالتطابق التام على الهوية الرسمية؛ الاسم: contains
  const digits = search.replace(/[^0-9]/g, "");
  const phoneTail = digits.length >= 9 ? "0" + digits.slice(-9) : null;

  const where = search
    ? {
        OR: [
          { fullName: { contains: search } },
          ...(phoneTail ? [{ primaryPhone: phoneTail }] : []),
        ],
      }
    : {};

  const [items, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: [{ lastOrderAt: { sort: "desc", nulls: "last" } }, { id: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        fullName: true,
        primaryPhone: true,
        commune: true,
        riskLevel: true,
        firstOrderAt: true,
        lastOrderAt: true,
      },
    }),
    prisma.customer.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

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
                <th className="px-4 py-3 text-start">المخاطرة</th>
                <th className="px-4 py-3 text-start">أول طلب</th>
                <th className="px-4 py-3 text-start">آخر طلب</th>
              </tr>
            </thead>
            <tbody>
              {items.map((customer) => (
                <tr key={customer.id} className="border-t border-neutral-100">
                  <td className="px-4 py-3 font-semibold">{customer.fullName}</td>
                  <td className="px-4 py-3 font-mono" dir="ltr">
                    {maskPhoneForDisplay(customer.primaryPhone)}
                  </td>
                  <td className="px-4 py-3">{customer.commune ?? "—"}</td>
                  <td className="px-4 py-3">
                    {RISK_LABELS[customer.riskLevel] ?? customer.riskLevel}
                  </td>
                  <td className="px-4 py-3 text-neutral-500">
                    {customer.firstOrderAt ? formatDate(customer.firstOrderAt.toISOString()) : "—"}
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
        <p className="text-xs text-neutral-400">
          صفحة {page} من {totalPages}
        </p>
      )}
    </div>
  );
}
