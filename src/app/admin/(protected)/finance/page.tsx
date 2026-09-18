import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission, hasPermission } from "@/lib/auth/requirePermission";
import { listSettlements } from "@/server/modules/finance/codSettlementService";
import { listFinancialAdjustments } from "@/server/modules/finance/financialAdjustmentsService";
import ProfitabilityDashboard from "@/components/admin/crm/ProfitabilityDashboard";
import SettlementImportForm from "@/components/admin/crm/SettlementImportForm";
import AdjustmentForm from "@/components/admin/crm/AdjustmentForm";
import { ADJUSTMENT_DIRECTION_LABELS, ADJUSTMENT_TYPE_LABELS, SETTLEMENT_STATUS_LABELS, moment } from "@/components/admin/crm/financeLabels";
import { formatPrice } from "@/lib/format";

export const metadata: Metadata = { title: "المالية — إدارة المتجر", robots: { index: false, follow: false } };

// المالية — finance.read للعرض؛ الاستيراد finance.reconcile؛ التعديلات finance.adjust.
// ثلاث تبويبات عبر ?tab=: الربحية (المحرك)، تسويات COD، التعديلات المالية.

const TABS = [
  { key: "profitability", label: "الربحية" },
  { key: "settlements", label: "تسويات COD" },
  { key: "adjustments", label: "التعديلات المالية" },
] as const;
type Tab = (typeof TABS)[number]["key"];

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ tab?: string; page?: string }> }) {
  await requirePermission("finance.read");
  const params = await searchParams;
  const tab: Tab = TABS.some((t) => t.key === params.tab) ? (params.tab as Tab) : "profitability";
  const page = Math.max(1, Number(params.page) || 1);
  const [canReconcile, canAdjust] = await Promise.all([hasPermission("finance.reconcile"), hasPermission("finance.adjust")]);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-xl font-bold text-cream">المالية</h1>
      <nav className="flex gap-2 border-b border-gold/15">
        {TABS.map((t) => (
          <Link key={t.key} href={"/admin/finance?tab=" + t.key} data-testid={"finance-tab-" + t.key} className={"px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px " + (tab === t.key ? "border-gold text-gold" : "border-transparent text-cream-dim hover:text-cream")}>
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "profitability" && <ProfitabilityDashboard />}

      {tab === "settlements" && (
        <div className="space-y-6">
          {canReconcile && <SettlementImportForm />}
          <SettlementsTable page={page} />
        </div>
      )}

      {tab === "adjustments" && (
        <div className="space-y-4">
          {canAdjust && <AdjustmentForm />}
          <AdjustmentsTable page={page} />
        </div>
      )}
    </div>
  );
}

async function SettlementsTable({ page }: { page: number }) {
  const { items, total, pageSize } = await listSettlements({ page, pageSize: 20 });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="gold-border bg-ink rounded-xl overflow-x-auto">
      <table className="w-full text-sm" data-testid="settlements-table">
        <thead className="text-cream-dim text-xs">
          <tr>
            <th className="px-4 py-3 text-start">الناقل</th>
            <th className="px-4 py-3 text-start">تاريخ التسوية</th>
            <th className="px-4 py-3 text-start">المفتاح</th>
            <th className="px-4 py-3 text-start">المتوقَّع</th>
            <th className="px-4 py-3 text-start">المحصَّل</th>
            <th className="px-4 py-3 text-start">الفرق</th>
            <th className="px-4 py-3 text-start">الحالة</th>
            <th className="px-4 py-3 text-start">سطور</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-cream-dim">لا تسويات بعد.</td></tr>}
          {items.map((s) => (
            <tr key={s.id} className="border-t border-gold/10 text-cream">
              <td className="px-4 py-3" dir="ltr">{s.provider}</td>
              <td className="px-4 py-3" dir="ltr">{s.settlementDate.toISOString().slice(0, 10)}</td>
              <td className="px-4 py-3"><Link href={"/admin/finance/settlements/" + s.id} className="hover:text-gold" dir="ltr">{s.reconciliationKey}</Link></td>
              <td className="px-4 py-3" dir="ltr">{formatPrice(s.expectedDzd)}</td>
              <td className="px-4 py-3" dir="ltr">{formatPrice(s.collectedDzd)}</td>
              <td className={"px-4 py-3 " + (s.discrepancyDzd !== 0 ? "text-amber-400" : "")} dir="ltr">{formatPrice(s.discrepancyDzd)}</td>
              <td className="px-4 py-3">{SETTLEMENT_STATUS_LABELS[s.status]}</td>
              <td className="px-4 py-3" dir="ltr">{s._count.items}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {totalPages > 1 && (
        <div className="flex justify-between p-3 text-xs text-cream-dim">
          {page > 1 ? <Link href={"/admin/finance?tab=settlements&page=" + (page - 1)}>السابق</Link> : <span />}
          <span>صفحة {page} من {totalPages}</span>
          {page < totalPages ? <Link href={"/admin/finance?tab=settlements&page=" + (page + 1)}>التالي</Link> : <span />}
        </div>
      )}
    </div>
  );
}

async function AdjustmentsTable({ page }: { page: number }) {
  const { items, total, pageSize } = await listFinancialAdjustments({ page, pageSize: 20 });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="gold-border bg-ink rounded-xl overflow-x-auto">
      <table className="w-full text-sm" data-testid="adjustments-table">
        <thead className="text-cream-dim text-xs">
          <tr>
            <th className="px-4 py-3 text-start">الطلب</th>
            <th className="px-4 py-3 text-start">النوع</th>
            <th className="px-4 py-3 text-start">الاتجاه</th>
            <th className="px-4 py-3 text-start">المبلغ</th>
            <th className="px-4 py-3 text-start">السبب</th>
            <th className="px-4 py-3 text-start">بواسطة</th>
            <th className="px-4 py-3 text-start">التاريخ</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-cream-dim">لا تعديلات مالية.</td></tr>}
          {items.map((a) => (
            <tr key={a.id} className="border-t border-gold/10 text-cream">
              <td className="px-4 py-3"><Link href={"/admin/orders/" + a.order.id} className="hover:text-gold" dir="ltr">{a.order.orderNumber}</Link></td>
              <td className="px-4 py-3">{ADJUSTMENT_TYPE_LABELS[a.type]}</td>
              <td className="px-4 py-3">{ADJUSTMENT_DIRECTION_LABELS[a.direction]}</td>
              <td className="px-4 py-3" dir="ltr">{formatPrice(a.amountDzd)}</td>
              <td className="px-4 py-3 text-cream-dim">{a.reason}{a.correctionOfId && <span className="ms-1 text-gold">(تصحيح)</span>}</td>
              <td className="px-4 py-3 text-cream-dim">{a.createdBy?.fullName ?? a.createdBy?.email ?? "النظام"}</td>
              <td className="px-4 py-3 text-cream-dim" dir="ltr">{moment(a.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {totalPages > 1 && (
        <div className="flex justify-between p-3 text-xs text-cream-dim">
          {page > 1 ? <Link href={"/admin/finance?tab=adjustments&page=" + (page - 1)}>السابق</Link> : <span />}
          <span>صفحة {page} من {totalPages}</span>
          {page < totalPages ? <Link href={"/admin/finance?tab=adjustments&page=" + (page + 1)}>التالي</Link> : <span />}
        </div>
      )}
    </div>
  );
}
