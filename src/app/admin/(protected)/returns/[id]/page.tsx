import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { requirePermission, hasPermission } from "@/lib/auth/requirePermission";
import { allowedReturnTransitions, getReturn, isRestockable } from "@/server/modules/returns/returnsService";
import ReturnActions from "@/components/admin/crm/ReturnActions";
import { RETURN_REASON_LABELS, RETURN_STATUS_LABELS, moment } from "@/components/admin/crm/financeLabels";

// تفاصيل دورة إرجاع — الانتقالات (returns.manage) والاسترجاع (returns.manage + inventory.adjust).

export default async function ReturnDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("returns.read");
  const { id } = await params;
  const [record, canManage, canRestock] = await Promise.all([
    getReturn(id),
    hasPermission("returns.manage"),
    hasPermission("inventory.adjust"),
  ]);
  if (!record) notFound();

  return (
    <div className="space-y-6">
      <Link href="/admin/returns" className="inline-flex items-center gap-1.5 text-sm text-cream-dim hover:text-gold">
        <ChevronRight className="w-4 h-4 icon-flip" />
        العودة للمرتجعات
      </Link>
      <header>
        <h1 className="font-display text-xl font-bold text-cream" dir="ltr">{record.returnNumber}</h1>
        <p className="text-sm text-cream-dim">
          الطلب <Link href={"/admin/orders/" + record.order.id} className="hover:text-gold" dir="ltr">{record.order.orderNumber}</Link> ·{" "}
          {record.order.customerFirstName} {record.order.customerLastName} · دورة رقم {record.cycleNumber}
          {record.isExchange && <span className="ms-2 text-gold">استبدال صريح</span>}
        </p>
      </header>

      <div className="gold-border bg-ink rounded-xl p-5 grid gap-3 text-sm sm:grid-cols-2">
        <div className="flex justify-between"><span className="text-cream-dim">الحالة</span><span className="text-cream font-semibold" data-testid="return-status">{RETURN_STATUS_LABELS[record.status]}</span></div>
        <div className="flex justify-between"><span className="text-cream-dim">السبب</span><span className="text-cream">{RETURN_REASON_LABELS[record.reason]}</span></div>
        <div className="flex justify-between"><span className="text-cream-dim">كلفة الشحن الصادر</span><span className="text-cream">{record.outboundShippingCostDzd ?? "—"} دج</span></div>
        <div className="flex justify-between"><span className="text-cream-dim">كلفة شحن الإرجاع</span><span className="text-cream">{record.returnShippingCostDzd ?? "—"} دج</span></div>
        <div className="flex justify-between"><span className="text-cream-dim">أُنشئت</span><span className="text-cream" dir="ltr">{moment(record.createdAt)}</span></div>
        <div className="flex justify-between"><span className="text-cream-dim">أُنهيت</span><span className="text-cream" dir="ltr">{record.resolvedAt ? moment(record.resolvedAt) : "—"}</span></div>
        {record.notes && <p className="sm:col-span-2 text-cream-dim">{record.notes}</p>}
      </div>

      <div className="gold-border bg-ink rounded-xl p-5">
        <h2 className="font-display text-base font-bold text-cream mb-3">البنود</h2>
        <table className="w-full text-sm">
          <thead className="text-cream-dim text-xs">
            <tr>
              <th className="px-3 py-2 text-start">المنتج</th>
              <th className="px-3 py-2 text-start">كمية الطلب</th>
              <th className="px-3 py-2 text-start">المُرجَع</th>
              <th className="px-3 py-2 text-start">المُسترجَع للمخزون</th>
              <th className="px-3 py-2 text-start">الحالة الفيزيائية</th>
            </tr>
          </thead>
          <tbody>
            {record.items.map((it) => (
              <tr key={it.id} className="border-t border-gold/10 text-cream">
                <td className="px-3 py-2">
                  {it.orderItem.productNameSnapshot}
                  {it.orderItem.variantLabelSnapshot && <span className="ms-1 text-xs text-cream-dim">({it.orderItem.variantLabelSnapshot})</span>}
                </td>
                <td className="px-3 py-2" dir="ltr">{it.orderItem.quantity}</td>
                <td className="px-3 py-2" dir="ltr">{it.quantity}</td>
                <td className="px-3 py-2" dir="ltr" data-testid={"restocked-" + it.id}>{it.restockedQuantity}</td>
                <td className="px-3 py-2 text-cream-dim">{it.condition ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canManage && (
        <ReturnActions
          returnId={record.id}
          transitions={[...allowedReturnTransitions(record.status)]}
          canRestock={canRestock && isRestockable(record.status)}
          items={record.items.map((it) => ({
            id: it.id,
            name: it.orderItem.productNameSnapshot,
            quantity: it.quantity,
            restockedQuantity: it.restockedQuantity,
          }))}
        />
      )}
    </div>
  );
}
