import { hasPermission } from "@/lib/auth/requirePermission";
import { getOrderProfitLine } from "@/server/modules/finance/profitabilityService";
import { listFinancialAdjustments } from "@/server/modules/finance/financialAdjustmentsService";
import AdjustmentForm from "@/components/admin/crm/AdjustmentForm";
import { ADJUSTMENT_DIRECTION_LABELS, ADJUSTMENT_TYPE_LABELS, moment } from "@/components/admin/crm/financeLabels";
import { formatPrice } from "@/lib/format";

// اللوحة المالية لصفحة الطلب — سطر الربحية من المحرك (مصدر واحد) + التعديلات المالية.

const PROVENANCE_LABELS = { actual: "فعلية", estimated: "تقدير (رسم التوصيل)", unavailable: "غير متاحة" } as const;
const AD_LABELS = { allocated: "مخصَّص", unavailable: "بلا إنفاق مسجَّل", none: "بلا عزو" } as const;

export default async function OrderFinancePanel({ orderId }: { orderId: string }) {
  const [canRead, canAdjust] = await Promise.all([hasPermission("finance.read"), hasPermission("finance.adjust")]);
  if (!canRead) return null;
  const [line, adjustments] = await Promise.all([
    getOrderProfitLine(orderId),
    listFinancialAdjustments({ orderId, page: 1, pageSize: 50 }),
  ]);

  const rows: [string, number][] = line
    ? [
        ["صافي المبيعات", line.netSalesDzd],
        ["إيراد التوصيل", line.deliveryRevenueDzd],
        ["كلفة البضاعة", -line.cogsDzd],
        ["كلفة الناقل (" + PROVENANCE_LABELS[line.carrierCostProvenance] + ")", -line.carrierCostDzd],
        ["كلفة الإرجاع/RTO", -line.rtoReturnCostDzd],
        ["التغليف", -line.packagingCostDzd],
        ["الإعلانات (" + AD_LABELS[line.advertisingProvenance] + ")", -line.advertisingDzd],
        ["أخرى", -line.otherCostDzd],
        ["التعديلات", line.adjustmentsDzd],
      ]
    : [];

  return (
    <div className="gold-border bg-ink rounded-xl p-5 mt-6" data-testid="order-finance-panel">
      <h2 className="font-display text-base font-bold text-cream mb-4">المالية والربحية</h2>
      {!line ? (
        <p className="text-sm text-cream-dim">طلب اختبار أو مستبعد — لا ربحية إنتاجية.</p>
      ) : (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-cream-dim sm:grid-cols-3">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-2">
              <dt>{label}</dt>
              <dd dir="ltr" className="text-cream">{formatPrice(value)}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-2 col-span-full border-t border-gold/10 pt-2 text-sm font-bold text-cream">
            <dt>صافي الربح {line.recognized ? "" : "(غير معترف به — لم يُسلَّم)"}</dt>
            <dd dir="ltr" data-testid="order-net-profit">{formatPrice(line.netProfitDzd)}</dd>
          </div>
          {line.unknownCostItems > 0 && <p className="col-span-full text-amber-400">{line.unknownCostItems} وحدة بتكلفة غير معلومة — الربح أعلى من الحقيقي حتى تُضبط التكلفة.</p>}
        </dl>
      )}

      <div className="mt-4 border-t border-gold/10 pt-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-cream">التعديلات المالية</h3>
          {canAdjust && line && <AdjustmentForm orderId={orderId} />}
        </div>
        {adjustments.items.length === 0 ? (
          <p className="text-xs text-cream-dim">لا تعديلات.</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {adjustments.items.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 text-cream-dim">
                <span>
                  {ADJUSTMENT_TYPE_LABELS[a.type]} · {ADJUSTMENT_DIRECTION_LABELS[a.direction]} · {a.reason}
                  {a.correctionOfId && <span className="ms-1 text-gold">(تصحيح)</span>}
                  {a.corrections.length > 0 && <span className="ms-1 text-amber-400">(له تصحيح)</span>}
                </span>
                <span dir="ltr" className="text-cream">{(a.direction === "credit" ? "+" : "−") + formatPrice(a.amountDzd)} · {moment(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
