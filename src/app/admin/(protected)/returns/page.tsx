import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/requirePermission";
import { listReturns } from "@/server/modules/returns/returnsService";
import { RETURN_REASON_LABELS, RETURN_STATUS_LABELS, moment } from "@/components/admin/crm/financeLabels";
import { ReturnStatus } from "@prisma/client";

export const metadata: Metadata = { title: "المرتجعات — إدارة المتجر", robots: { index: false, follow: false } };

// قائمة دورات الإرجاع — returns.read. الإنشاء من صفحة الطلب نفسها (لوحة المرتجعات).

const PAGE_SIZE = 20;

export default async function ReturnsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string }>;
}) {
  await requirePermission("returns.read");
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const status = params.status && params.status in ReturnStatus ? (params.status as ReturnStatus) : undefined;
  const { items, total } = await listReturns({ status, page, pageSize: PAGE_SIZE });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (extra: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    if (status) q.set("status", status);
    for (const [k, v] of Object.entries(extra)) {
      if (v === undefined) q.delete(k);
      else q.set(k, v);
    }
    const s = q.toString();
    return "/admin/returns" + (s ? "?" + s : "");
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-bold text-cream">المرتجعات</h1>
          <p className="text-sm text-cream-dim">{total} دورة إرجاع — الاسترجاع للمخزون من تفاصيل الدورة فقط</p>
        </div>
        <nav className="flex flex-wrap gap-2 text-xs">
          <Link href="/admin/returns" className={"rounded-lg border px-3 py-1.5 " + (!status ? "gold-gradient text-ink" : "border-gold/25 text-cream-dim")}>الكل</Link>
          {(["open", "received", "partially_restocked", "restocked", "closed", "rejected"] as ReturnStatus[]).map((s) => (
            <Link key={s} href={href({ status: s, page: undefined })} className={"rounded-lg border px-3 py-1.5 " + (status === s ? "gold-gradient text-ink" : "border-gold/25 text-cream-dim")}>
              {RETURN_STATUS_LABELS[s]}
            </Link>
          ))}
        </nav>
      </header>

      {items.length === 0 ? (
        <div className="gold-border bg-ink rounded-xl py-16 text-center text-sm text-cream-dim">لا دورات إرجاع مطابقة.</div>
      ) : (
        <div className="gold-border bg-ink rounded-xl overflow-x-auto">
          <table className="w-full text-sm" data-testid="returns-table">
            <thead className="text-cream-dim text-xs">
              <tr>
                <th className="px-4 py-3 text-start">رقم الإرجاع</th>
                <th className="px-4 py-3 text-start">الطلب</th>
                <th className="px-4 py-3 text-start">السبب</th>
                <th className="px-4 py-3 text-start">الحالة</th>
                <th className="px-4 py-3 text-start">الكمية / المُسترجَع</th>
                <th className="px-4 py-3 text-start">أُنشئت</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => {
                const qty = r.items.reduce((s, i) => s + i.quantity, 0);
                const restocked = r.items.reduce((s, i) => s + i.restockedQuantity, 0);
                return (
                  <tr key={r.id} className="border-t border-gold/10 text-cream">
                    <td className="px-4 py-3 font-semibold">
                      <Link href={"/admin/returns/" + r.id} className="hover:text-gold" dir="ltr">{r.returnNumber}</Link>
                      {r.isExchange && <span className="ms-2 text-[10px] text-gold">استبدال</span>}
                    </td>
                    <td className="px-4 py-3"><Link href={"/admin/orders/" + r.order.id} className="hover:text-gold" dir="ltr">{r.order.orderNumber}</Link></td>
                    <td className="px-4 py-3 text-cream-dim">{RETURN_REASON_LABELS[r.reason]}</td>
                    <td className="px-4 py-3">{RETURN_STATUS_LABELS[r.status]}</td>
                    <td className="px-4 py-3" dir="ltr">{restocked} / {qty}</td>
                    <td className="px-4 py-3 text-cream-dim" dir="ltr">{moment(r.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <nav className="flex items-center justify-between text-sm text-cream-dim">
          {page > 1 ? <Link href={href({ page: String(page - 1) })} className="rounded-lg border border-gold/25 px-3 py-1.5">السابق</Link> : <span />}
          <span className="text-xs">صفحة {page} من {totalPages}</span>
          {page < totalPages ? <Link href={href({ page: String(page + 1) })} className="rounded-lg border border-gold/25 px-3 py-1.5">التالي</Link> : <span />}
        </nav>
      )}
    </div>
  );
}
