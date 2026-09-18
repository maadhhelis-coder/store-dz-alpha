import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { requirePermission, hasPermission } from "@/lib/auth/requirePermission";
import { getSettlement } from "@/server/modules/finance/codSettlementService";
import ResolveSettlementItemButton from "@/components/admin/crm/ResolveSettlementItemButton";
import { SETTLEMENT_ITEM_STATE_LABELS, SETTLEMENT_STATUS_LABELS, moment } from "@/components/admin/crm/financeLabels";
import { formatPrice } from "@/lib/format";

// تفاصيل تسوية COD — سطورها وحالاتها، وحل الفروق (finance.reconcile).

export default async function SettlementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("finance.read");
  const { id } = await params;
  const [settlement, canReconcile] = await Promise.all([getSettlement(id), hasPermission("finance.reconcile")]);
  if (!settlement) notFound();

  return (
    <div className="space-y-6">
      <Link href="/admin/finance?tab=settlements" className="inline-flex items-center gap-1.5 text-sm text-cream-dim hover:text-gold">
        <ChevronRight className="w-4 h-4 icon-flip" />
        العودة للتسويات
      </Link>
      <header>
        <h1 className="font-display text-xl font-bold text-cream" dir="ltr">{settlement.provider} · {settlement.reconciliationKey}</h1>
        <p className="text-sm text-cream-dim" data-testid="settlement-status">
          {SETTLEMENT_STATUS_LABELS[settlement.status]} · متوقَّع {formatPrice(settlement.expectedDzd)} · محصَّل {formatPrice(settlement.collectedDzd)} · فرق {formatPrice(settlement.discrepancyDzd)}
          {settlement.resolvedAt && <span> · حُلَّت {moment(settlement.resolvedAt)}</span>}
        </p>
        {settlement.reason && <p className="mt-1 text-xs text-amber-400">{settlement.reason}</p>}
      </header>

      <div className="gold-border bg-ink rounded-xl overflow-x-auto">
        <table className="w-full text-sm" data-testid="settlement-items">
          <thead className="text-cream-dim text-xs">
            <tr>
              <th className="px-4 py-3 text-start">الطلب</th>
              <th className="px-4 py-3 text-start">التتبّع</th>
              <th className="px-4 py-3 text-start">المتوقَّع</th>
              <th className="px-4 py-3 text-start">المحصَّل</th>
              <th className="px-4 py-3 text-start">الفرق</th>
              <th className="px-4 py-3 text-start">الحالة</th>
              <th className="px-4 py-3 text-start">السبب</th>
              <th className="px-4 py-3 text-start">إجراء</th>
            </tr>
          </thead>
          <tbody>
            {settlement.items.map((it) => (
              <tr key={it.id} className="border-t border-gold/10 text-cream">
                <td className="px-4 py-3"><Link href={"/admin/orders/" + it.order.id} className="hover:text-gold" dir="ltr">{it.order.orderNumber}</Link></td>
                <td className="px-4 py-3" dir="ltr">{it.trackingNumber ?? "—"}</td>
                <td className="px-4 py-3" dir="ltr">{formatPrice(it.expectedDzd)}</td>
                <td className="px-4 py-3" dir="ltr">{formatPrice(it.collectedDzd)}</td>
                <td className={"px-4 py-3 " + (it.discrepancyDzd !== 0 ? "text-amber-400" : "")} dir="ltr">{formatPrice(it.discrepancyDzd)}</td>
                <td className="px-4 py-3" data-testid={"item-state-" + it.id}>{SETTLEMENT_ITEM_STATE_LABELS[it.state] ?? it.state}</td>
                <td className="px-4 py-3 text-xs text-cream-dim">{it.reason ?? "—"}</td>
                <td className="px-4 py-3">
                  {canReconcile && (it.state === "discrepancy" || it.state === "pending") ? (
                    <ResolveSettlementItemButton settlementId={settlement.id} itemId={it.id} />
                  ) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
