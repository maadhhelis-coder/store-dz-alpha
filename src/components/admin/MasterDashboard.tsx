"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Loader2,
  ShoppingCart,
  Wallet,
  CheckCircle2,
  Truck,
  XCircle,
  RotateCcw,
  Wallet2,
  TrendingUp,
  AlertTriangle,
  Gauge,
} from "lucide-react";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

type AnalyticsRange = "today" | "yesterday" | "7d" | "30d" | "all";

type WebVitalRow = {
  name: "LCP" | "INP" | "CLS" | "TTFB" | "FCP";
  p75: number | null;
  sampleCount: number;
  goodCount: number;
  needsImprovementCount: number;
  poorCount: number;
};

type ProductPerformanceRow = {
  slug: string;
  name: string;
  visits: number;
  totalOrders: number;
  confirmedOrders: number;
  deliveredOrders: number;
  cancelledOrders: number;
  returnedOrders: number;
  revenueDzd: number;
  conversionRate: number;
  confirmationRate: number;
  deliveryRate: number;
  cancellationRate: number;
};

type Alert = { severity: "critical" | "warning"; metric: string; message: string };

type MasterDashboardData = {
  range: AnalyticsRange;
  filters: { productSlug?: string; wilayaCode?: number };
  kpis: {
    totalRevenueDzd: number;
    totalOrders: number;
    confirmedOrders: number;
    deliveredOrders: number;
    avgOrderValueDzd: number;
    totalTraffic: number;
    confirmationRate: number;
    deliveryRate: number;
  };
  cpa: { totalSpendDzd: number; cpaDzd: number | null };
  webVitals: WebVitalRow[];
  profitMetrics: {
    deliveredOrders: number;
    grossProfitDzd: number;
    profitPerDeliveredOrderDzd: number | null;
    hasIncompleteCostData: boolean;
    itemsMissingCost: number;
  };
  returnRate: { delivered: number; returned: number; rate: number };
  cancellationRate: { confirmed: number; cancelled: number; rate: number };
  roas: { revenueDzd: number; spendDzd: number; roas: number | null };
  productPerformance: ProductPerformanceRow[];
  periodComparison: {
    deltaPct: Partial<Record<string, number | null>>;
  };
  alerts: Alert[];
};

const RANGE_OPTIONS: { value: AnalyticsRange; label: string }[] = [
  { value: "today", label: "اليوم" },
  { value: "yesterday", label: "الأمس" },
  { value: "7d", label: "7 أيام" },
  { value: "30d", label: "30 يومًا" },
  { value: "all", label: "كل الفترة" },
];

type ProductOption = { slug: string; name: string };
type WilayaOption = { code: number; name: string };

// عتبات Core Web Vitals الرسمية القياسية (web.dev) — نفس التصنيف الذي تعتمده أدوات Google
// نفسها، لا تصنيفًا مُخترعًا هنا.
const WEB_VITAL_THRESHOLDS: Record<WebVitalRow["name"], { good: number; needsImprovement: number; unit: "ms" | "" }> = {
  LCP: { good: 2500, needsImprovement: 4000, unit: "ms" },
  INP: { good: 200, needsImprovement: 500, unit: "ms" },
  CLS: { good: 0.1, needsImprovement: 0.25, unit: "" },
  TTFB: { good: 800, needsImprovement: 1800, unit: "ms" },
  FCP: { good: 1800, needsImprovement: 3000, unit: "ms" },
};

function vitalRatingColor(name: WebVitalRow["name"], p75: number | null): string {
  if (p75 === null) return "#a89a7d";
  const t = WEB_VITAL_THRESHOLDS[name];
  if (p75 <= t.good) return "#6aa84f";
  if (p75 <= t.needsImprovement) return "#f6b26b";
  return "#e06666";
}

function formatVitalValue(name: WebVitalRow["name"], p75: number | null): string {
  if (p75 === null) return "—";
  if (name === "CLS") return p75.toFixed(3);
  return `${Math.round(p75)} ms`;
}

function DeltaBadge({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) return null;
  const isUp = value > 0;
  const isFlat = value === 0;
  return (
    <span
      className={cn(
        "text-[11px] font-semibold ms-1.5",
        isFlat ? "text-cream-dim" : isUp ? "text-emerald-400" : "text-red-400",
      )}
    >
      {isFlat ? "٠٪" : `${isUp ? "▲" : "▼"} ${Math.abs(value)}٪`}
    </span>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  delta,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  value: string;
  delta?: number | null;
}) {
  return (
    <div className="rounded-xl gold-border bg-ink p-5">
      <div className="flex items-center justify-between mb-3">
        <Icon className="w-5 h-5 text-gold" strokeWidth={1.75} />
      </div>
      <p className="text-xl font-bold text-cream">
        {value}
        <DeltaBadge value={delta} />
      </p>
      <p className="text-xs text-cream-dim mt-1">{label}</p>
    </div>
  );
}

export default function MasterDashboard() {
  const [range, setRange] = useState<AnalyticsRange>("7d");
  const [wilayaCode, setWilayaCode] = useState<number | "">("");
  const [productSlug, setProductSlug] = useState("");
  const [productOptions, setProductOptions] = useState<ProductOption[]>([]);
  const [wilayaOptions, setWilayaOptions] = useState<WilayaOption[]>([]);
  const [data, setData] = useState<MasterDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [productFilter, setProductFilter] = useState("");

  const hasFilter = wilayaCode !== "" || productSlug !== "";

  const fetchData = useCallback(async (r: AnalyticsRange, slug: string, wilaya: number | "") => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ range: r });
      if (slug) params.set("productSlug", slug);
      if (wilaya !== "") params.set("wilayaCode", String(wilaya));
      const res = await fetch(`/api/admin/master-dashboard?${params.toString()}`);
      const json = await res.json();
      setData(json);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData(range, productSlug, wilayaCode);
  }, [range, productSlug, wilayaCode, fetchData]);

  useEffect(() => {
    fetch("/api/admin/products?pageSize=100")
      .then((res) => res.json())
      .then((json) => {
        const items = (json.items ?? []) as { slug: string; name: string }[];
        setProductOptions(items.map((p) => ({ slug: p.slug, name: p.name })));
      })
      .catch(() => {});
    fetch("/api/wilayas")
      .then((res) => res.json())
      .then((json) => {
        const wilayas = (json.wilayas ?? []) as { code: number; name: string }[];
        setWilayaOptions(wilayas.map((w) => ({ code: w.code, name: w.name })));
      })
      .catch(() => {});
  }, []);

  const filteredProducts = useMemo(() => {
    if (!data) return [];
    const q = productFilter.trim().toLowerCase();
    if (!q) return data.productPerformance;
    return data.productPerformance.filter((p) => p.name.toLowerCase().includes(q));
  }, [data, productFilter]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex flex-wrap items-center gap-2">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setRange(opt.value)}
              className={cn(
                "text-sm px-3 py-1.5 rounded-lg border transition-colors",
                range === opt.value
                  ? "gold-gradient text-ink font-semibold border-transparent"
                  : "border-gold/25 text-cream-dim hover:border-gold/50",
              )}
            >
              {opt.label}
            </button>
          ))}
          <select
            value={productSlug}
            onChange={(e) => setProductSlug(e.target.value)}
            className="text-sm px-3 py-1.5 rounded-lg bg-black/40 border border-gold/20 text-cream focus:outline-none focus:border-gold/50"
          >
            <option value="">كل المنتجات</option>
            {productOptions.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            value={wilayaCode}
            onChange={(e) => setWilayaCode(e.target.value ? Number(e.target.value) : "")}
            className="text-sm px-3 py-1.5 rounded-lg bg-black/40 border border-gold/20 text-cream focus:outline-none focus:border-gold/50"
          >
            <option value="">كل الولايات</option>
            {wilayaOptions.map((w) => (
              <option key={w.code} value={w.code}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
        {loading && <Loader2 className="w-4 h-4 animate-spin text-gold" />}
      </div>

      {data && (
        <>
          {data.alerts.length > 0 && (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 mb-6">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-5 h-5 text-red-400" strokeWidth={1.75} />
                <p className="text-sm font-bold text-cream">تنبيهات أداء حقيقية</p>
              </div>
              <ul className="space-y-1.5">
                {data.alerts.map((a, i) => (
                  <li
                    key={i}
                    className={cn("text-xs", a.severity === "critical" ? "text-red-300" : "text-amber-300")}
                  >
                    {a.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* KPIs التجارية الرئيسية */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <KpiCard
              icon={ShoppingCart}
              label="الطلبات"
              value={String(data.kpis.totalOrders)}
              delta={data.periodComparison.deltaPct.totalOrders}
            />
            <KpiCard
              icon={Wallet}
              label="الإيرادات"
              value={formatPrice(data.kpis.totalRevenueDzd)}
              delta={data.periodComparison.deltaPct.totalRevenueDzd}
            />
            <KpiCard
              icon={CheckCircle2}
              label="معدل التأكيد"
              value={`${data.kpis.confirmationRate}%`}
              delta={data.periodComparison.deltaPct.confirmationRate}
            />
            <KpiCard
              icon={Truck}
              label="معدل التسليم (من المؤكَّد)"
              value={`${data.kpis.deliveryRate}%`}
              delta={data.periodComparison.deltaPct.deliveryRate}
            />
            <KpiCard icon={XCircle} label="معدل الإلغاء" value={`${data.cancellationRate.rate}%`} />
            <KpiCard icon={RotateCcw} label="معدل الإرجاع" value={`${data.returnRate.rate}%`} />
            <KpiCard icon={Wallet2} label="متوسط قيمة الطلب" value={formatPrice(data.kpis.avgOrderValueDzd)} />
            <KpiCard
              icon={Gauge}
              label={hasFilter ? "تكلفة اكتساب الطلب (30 يوم، كل المتجر)" : "تكلفة اكتساب الطلب (30 يوم)"}
              value={data.cpa.cpaDzd !== null ? formatPrice(data.cpa.cpaDzd) : "—"}
            />
          </div>

          {hasFilter && (
            <p className="text-xs text-cream-dim/80 mb-4">
              ⚠️ تكلفة الاكتساب وROAS لا يملكان بُعد منتج/ولاية فـبيانات الإعلانات (AdSpendEntry) — يبقيان رقمًا
              شاملًا للمتجر كله حتى مع الفلتر المفعَّل حاليًا.
            </p>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            <KpiCard
              icon={TrendingUp}
              label={hasFilter ? "ROAS (30 يوم، كل المتجر)" : "ROAS (30 يوم)"}
              value={data.roas.roas !== null ? `×${data.roas.roas}` : "—"}
            />
            <KpiCard
              icon={Wallet}
              label="الربح الإجمالي"
              value={formatPrice(data.profitMetrics.grossProfitDzd)}
            />
            <KpiCard
              icon={Wallet2}
              label="ربح الطلب المُسلَّم"
              value={
                data.profitMetrics.profitPerDeliveredOrderDzd !== null
                  ? formatPrice(data.profitMetrics.profitPerDeliveredOrderDzd)
                  : "—"
              }
            />
          </div>

          {data.profitMetrics.hasIncompleteCostData && (
            <p className="text-xs text-amber-400/90 mb-6">
              ⚠️ الربح المعروض ناقص: {data.profitMetrics.itemsMissingCost} بند طلب بلا سعر تكلفة مضبوط للمنتج —
              اضبط تكلفة الوحدة من صفحة المنتج لحساب دقيق.
            </p>
          )}

          {/* Core Web Vitals */}
          <div className="rounded-xl gold-border bg-ink p-5 mb-6">
            <h2 className="font-display font-semibold text-gold mb-4">سرعة الموقع (Core Web Vitals) — من زوّار حقيقيين</h2>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              {data.webVitals.map((v) => (
                <div key={v.name} className="rounded-lg border border-gold/15 p-3">
                  <p className="text-xs text-cream-dim mb-1">{v.name}</p>
                  <p className="text-lg font-bold" style={{ color: vitalRatingColor(v.name, v.p75) }}>
                    {formatVitalValue(v.name, v.p75)}
                  </p>
                  <p className="text-[11px] text-cream-dim mt-1">
                    {v.sampleCount > 0 ? `${v.sampleCount} عيّنة (p75)` : "لا توجد بيانات كافية بعد"}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* أداء كل منتج */}
          <div className="rounded-xl gold-border bg-ink p-5 mb-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h2 className="font-display font-semibold text-gold">أداء كل منتج</h2>
              <input
                type="text"
                value={productFilter}
                onChange={(e) => setProductFilter(e.target.value)}
                placeholder="ابحث عن منتج..."
                className="text-sm px-3 py-1.5 rounded-lg bg-black/40 border border-gold/20 text-cream placeholder:text-cream-dim/60 focus:outline-none focus:border-gold/50"
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="text-cream-dim text-xs border-b border-gold/15">
                    <th scope="col" className="p-2 text-start">المنتج</th>
                    <th scope="col" className="p-2 text-start">الزيارات</th>
                    <th scope="col" className="p-2 text-start">الطلبات</th>
                    <th scope="col" className="p-2 text-start">التحويل</th>
                    <th scope="col" className="p-2 text-start">التأكيد</th>
                    <th scope="col" className="p-2 text-start">التسليم</th>
                    <th scope="col" className="p-2 text-start">الإلغاء</th>
                    <th scope="col" className="p-2 text-start">الإيرادات</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((p) => (
                    <tr key={p.slug} className="border-b border-gold/10 last:border-0">
                      <td className="p-2 text-cream">{p.name}</td>
                      <td className="p-2 text-cream-dim">{p.visits}</td>
                      <td className="p-2 text-cream-dim">{p.totalOrders}</td>
                      <td className="p-2 text-cream-dim">{p.conversionRate}%</td>
                      <td className="p-2 text-cream-dim">{p.confirmationRate}%</td>
                      <td className="p-2 text-cream-dim">{p.deliveryRate}%</td>
                      <td className="p-2 text-cream-dim">{p.cancellationRate}%</td>
                      <td className="p-2 text-gold font-semibold">{formatPrice(p.revenueDzd)}</td>
                    </tr>
                  ))}
                  {filteredProducts.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-6 text-center text-cream-dim">
                        لا توجد بيانات كافية بعد
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
