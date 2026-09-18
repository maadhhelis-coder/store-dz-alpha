import Link from "next/link";
import { hasPermission } from "@/lib/auth/requirePermission";
import { getReturnsForOrder } from "@/server/modules/returns/returnsService";
import { isShippedEligible } from "@/server/modules/metrics/definitions";
import CreateReturnButton from "@/components/admin/crm/CreateReturnButton";
import { RETURN_REASON_LABELS, RETURN_STATUS_LABELS } from "@/components/admin/crm/financeLabels";
import type { OrderStatus } from "@prisma/client";

// لوحة المرتجعات في صفحة الطلب — دورات الإرجاع وزر إنشاء دورة جديدة (لما وصل الناقل فقط).
// القابل للإرجاع لكل بند = الكمية − Σ المُرجَع في الدورات غير المرفوضة.

export default async function ReturnsPanel({
  orderId,
  orderStatus,
  items,
}: {
  orderId: string;
  orderStatus: OrderStatus;
  items: { id: string; productNameSnapshot: string; quantity: number }[];
}) {
  const [returns, canRead, canManage] = await Promise.all([
    getReturnsForOrder(orderId),
    hasPermission("returns.read"),
    hasPermission("returns.manage"),
  ]);
  if (!canRead) return null;

  const returnedByItem = new Map<string, number>();
  for (const r of returns) {
    if (r.status === "rejected") continue;
    for (const it of r.items) returnedByItem.set(it.orderItemId, (returnedByItem.get(it.orderItemId) ?? 0) + it.quantity);
  }
  const formItems = items.map((it) => ({
    id: it.id,
    name: it.productNameSnapshot,
    quantity: it.quantity,
    returnable: Math.max(0, it.quantity - (returnedByItem.get(it.id) ?? 0)),
  }));
  const hasActive = returns.some((r) => !["closed", "rejected", "restocked"].includes(r.status));
  const canCreate = canManage && isShippedEligible(orderStatus) && !hasActive && formItems.some((i) => i.returnable > 0);

  return (
    <div className="gold-border bg-ink rounded-xl p-5 mt-6" data-testid="returns-panel">
      <h2 className="font-display text-base font-bold text-cream mb-4">دورات الإرجاع</h2>
      {returns.length === 0 ? (
        <p className="text-sm text-cream-dim">لا دورة إرجاع لهذا الطلب.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {returns.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gold/15 p-3 text-cream">
              <Link href={"/admin/returns/" + r.id} className="font-semibold hover:text-gold" dir="ltr">{r.returnNumber}</Link>
              <span className="text-xs text-cream-dim">
                {RETURN_REASON_LABELS[r.reason]} · {RETURN_STATUS_LABELS[r.status]}
                {r.isExchange && " · استبدال"} · مُسترجَع {r.items.reduce((s, i) => s + i.restockedQuantity, 0)} / {r.items.reduce((s, i) => s + i.quantity, 0)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {canCreate && (
        <div className="mt-4">
          <CreateReturnButton orderId={orderId} items={formItems} />
        </div>
      )}
    </div>
  );
}
