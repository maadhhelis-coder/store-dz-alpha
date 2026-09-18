"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

// لوحة الربحية — تستهلك /api/admin/crm/finance/profitability فقط (المحرك هو المصدر
// الوحيد؛ لا صيغة هنا). كل رقم بأساسه، وكل مقام صفر يُعرض «—» لا 0%.

type Range = "today" | "7d" | "30d" | "90d";
const RANGES: { key: Range; label: string }[] = [
  { key: "today", label: "اليوم" },
  { key: "7d", label: "7 أيام" },
  { key: "30d", label: "30 يومًا" },
  { key: "90d", label: "90 يومًا" },
];
const DIMENSIONS: { key: string; label: string }[] = [
  { key: "date", label: "التاريخ" },
  { key: "product", label: "المنتج" },
  { key: "order", label: "الطلب" },
  { key: "orderItem", label: "بند الطلب" },
  { key: "customer", label: "العميل" },
  { key: "creative", label: "الإبداع الإعلاني" },
  { key: "campaign", label: "الحملة" },
  { key: "adSet", label: "المجموعة الإعلانية" },
  { key: "ad", label: "الإعلان" },
  { key: "landingPage", label: "صفحة الهبوط" },
  { key: "wilaya", label: "الولاية" },
  { key: "commune", label: "البلدية" },
  { key: "carrier", label: "الناقل" },
];

type Components = {
  grossRevenueDzd: number; discountDzd: number; netSalesDzd: number; deliveryRevenueDzd: number; cogsDzd: number;
  carrierCostDzd: number; rtoReturnCostDzd: number; packagingCostDzd: number; advertisingDzd: number; otherCostDzd: number;
  adjustmentsDzd: number; netProfitDzd: number;
};
type Report = {
  summary: Components & {
    orders: number; recognizedOrders: number; unknownCostItems: number; estimatedCarrierOrders: number; actualCarrierOrders: number;
    adUnavailableOrders: number; attributedOrders: number; attributedSpendDzd: number; unallocatedSpendDzd: number; acquiredCustomers: number;
    aovDzd: number | null; roas: number | null; profitRoas: number | null; cacDzd: number | null; allocationMethod: string;
  };
  rates: {
    deliveryRatePercent: number | null; refusalRatePercent: number | null; cancellationRatePercent: number | null; rtoRatePercent: number | null;
    shippedEligibleOrders: number; deliveredOrders: number; totalOrders: number; cancelledOrders: number; rtoOrders: number; refusedReturns: number;
  };
  rows: (Components & { key: string; label: string; orders: number; recognizedOrders: number; unknownCostItems: number })[];
  unallocatedCreatives: string[];
};

const pct = (v: number | null) => (v === null ? "—" : v.toFixed(1) + "%");
const x = (v: number | null) => (v === null ? "—" : v.toFixed(2) + "x");
const dzd = (v: number | null) => (v === null ? "—" : formatPrice(v));

export default function ProfitabilityDashboard() {
  const [range, setRange] = useState<Range>("30d");
  const [dimension, setDimension] = useState("date");
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/crm/finance/profitability?range=" + range + "&dimension=" + dimension);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "تعذّر تحميل الربحية");
        return;
      }
      setData(json);
    } catch {
      setError("تعذر الاتصال بالخادم");
    } finally {
      setLoading(false);
    }
  }, [range, dimension]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- نفس نمط MasterDashboard
    void load();
  }, [load]);

  const s = data?.summary;
  const r = data?.rates;
  const kpis: [string, string, string][] =
    s && r
      ? [
          ["الإيراد الإجمالي (قبل الخصم)", dzd(s.grossRevenueDzd), "الطلبات المُسلَّمة غير المرتجعة"],
          ["صافي المبيعات", dzd(s.netSalesDzd), "الإجمالي − الخصم"],
          ["إيراد التوصيل", dzd(s.deliveryRevenueDzd), "deliveryPriceDzd"],
          ["كلفة البضاعة", dzd(s.cogsDzd), s.unknownCostItems > 0 ? s.unknownCostItems + " وحدة بتكلفة غير معلومة" : "لقطات unitCost"],
          ["كلفة الناقل", dzd(s.carrierCostDzd), s.estimatedCarrierOrders + " تقدير · " + s.actualCarrierOrders + " فعلية"],
          ["كلفة الإرجاع/RTO", dzd(s.rtoReturnCostDzd), "شحن الإرجاع + بضاعة لم تُسترجَع"],
          ["التغليف", dzd(s.packagingCostDzd), "لقطة وقت الإنشاء"],
          ["الإعلانات", dzd(s.advertisingDzd), s.attributedOrders + " طلب معزوّ · " + s.adUnavailableOrders + " بلا إنفاق"],
          ["أخرى", dzd(s.otherCostDzd), "لقطة وقت الإنشاء"],
          ["التعديلات", dzd(s.adjustmentsDzd), "credit − debit"],
          ["صافي الربح", dzd(s.netProfitDzd), s.recognizedOrders + " طلب معترف به من " + s.orders],
          ["AOV", dzd(s.aovDzd), "الإيراد المعترف به ÷ الطلبات المعترف بها"],
          ["معدل التسليم", pct(r.deliveryRatePercent), r.deliveredOrders + " ÷ " + r.shippedEligibleOrders + " وصل الناقل"],
          ["معدل الإلغاء", pct(r.cancellationRatePercent), r.cancelledOrders + " ÷ " + r.totalOrders],
          ["معدل الرفض", pct(r.refusalRatePercent), r.refusedReturns + " رفض ÷ " + r.shippedEligibleOrders],
          ["معدل RTO", pct(r.rtoRatePercent), r.rtoOrders + " ÷ " + r.shippedEligibleOrders],
          ["ROAS", x(s.roas), "إيراد معزوّ ÷ " + dzd(s.attributedSpendDzd)],
          ["Profit ROAS", x(s.profitRoas), "صافي ربح معزوّ ÷ إنفاق معزوّ"],
          ["CAC", dzd(s.cacDzd), s.acquiredCustomers + " عميل جديد معزوّ"],
          ["إنفاق غير مخصَّص", dzd(s.unallocatedSpendDzd), "إبداعات بلا إيراد مُسلَّم في الفترة"],
        ]
      : [];

  return (
    <div className="space-y-6" data-testid="profitability-dashboard">
      <div className="flex flex-wrap items-center gap-2">
        {RANGES.map((o) => (
          <button key={o.key} type="button" onClick={() => setRange(o.key)} className={cn("rounded-lg border px-3 py-1.5 text-xs", range === o.key ? "gold-gradient text-ink" : "border-gold/25 text-cream-dim")}>{o.label}</button>
        ))}
        <select value={dimension} onChange={(e) => setDimension(e.target.value)} data-testid="profit-dimension" className="ms-auto rounded-lg bg-black border border-gold/25 px-2 py-1.5 text-xs text-cream">
          {DIMENSIONS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
        </select>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {loading && !data && <p className="flex items-center gap-2 text-sm text-cream-dim"><Loader2 className="w-4 h-4 animate-spin" /> جارٍ التحميل…</p>}

      {data && s && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="profit-kpis">
            {kpis.map(([label, value, basis]) => (
              <div key={label} className="gold-border bg-ink rounded-xl p-4">
                <p className="text-xs text-cream-dim">{label}</p>
                <p className="mt-1 text-lg font-bold text-cream" dir="ltr">{value}</p>
                <p className="mt-1 text-[11px] text-cream-dim/70">{basis}</p>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-cream-dim/70">
            الإعلانات: إنفاق ad_spend_entries نافذة متدحرجة (لا تاريخ لكل صف) موزَّعة بـ{s.allocationMethod} على طلبات الفترة المعزوّة — فترة أطول من 30 يومًا تخصّص إنفاق 30 يومًا على طلبات أكثر.
          </p>

          <div className="gold-border bg-ink rounded-xl overflow-x-auto">
            <table className="w-full text-xs" data-testid="profit-rows">
              <thead className="text-cream-dim">
                <tr>
                  <th className="px-3 py-2 text-start">{DIMENSIONS.find((d) => d.key === dimension)?.label}</th>
                  <th className="px-3 py-2 text-start">طلبات</th>
                  <th className="px-3 py-2 text-start">صافي المبيعات</th>
                  <th className="px-3 py-2 text-start">التوصيل</th>
                  <th className="px-3 py-2 text-start">البضاعة</th>
                  <th className="px-3 py-2 text-start">الناقل</th>
                  <th className="px-3 py-2 text-start">إرجاع/RTO</th>
                  <th className="px-3 py-2 text-start">إعلانات</th>
                  <th className="px-3 py-2 text-start">تغليف+أخرى</th>
                  <th className="px-3 py-2 text-start">تعديلات</th>
                  <th className="px-3 py-2 text-start">صافي الربح</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 && (
                  <tr><td colSpan={11} className="px-3 py-6 text-center text-cream-dim">لا طلبات في الفترة.</td></tr>
                )}
                {data.rows.map((row) => (
                  <tr key={row.key} className="border-t border-gold/10 text-cream">
                    <td className="px-3 py-2" dir="auto">{row.label}</td>
                    <td className="px-3 py-2" dir="ltr">{row.recognizedOrders}/{row.orders}</td>
                    <td className="px-3 py-2" dir="ltr">{formatPrice(row.netSalesDzd)}</td>
                    <td className="px-3 py-2" dir="ltr">{formatPrice(row.deliveryRevenueDzd)}</td>
                    <td className="px-3 py-2" dir="ltr">{formatPrice(row.cogsDzd)}</td>
                    <td className="px-3 py-2" dir="ltr">{formatPrice(row.carrierCostDzd)}</td>
                    <td className="px-3 py-2" dir="ltr">{formatPrice(row.rtoReturnCostDzd)}</td>
                    <td className="px-3 py-2" dir="ltr">{formatPrice(row.advertisingDzd)}</td>
                    <td className="px-3 py-2" dir="ltr">{formatPrice(row.packagingCostDzd + row.otherCostDzd)}</td>
                    <td className="px-3 py-2" dir="ltr">{formatPrice(row.adjustmentsDzd)}</td>
                    <td className={cn("px-3 py-2 font-semibold", row.netProfitDzd < 0 && "text-red-400")} dir="ltr">{formatPrice(row.netProfitDzd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
