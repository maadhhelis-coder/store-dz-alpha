"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, ShoppingCart, Wallet, MousePointerClick, CheckCircle2 } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import type { OrderStatus } from "@prisma/client";
import { ORDER_STATUS_META } from "@/lib/orderStatus";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

type AnalyticsRange = "today" | "yesterday" | "7d" | "30d" | "all";

type AnalyticsOverview = {
  range: AnalyticsRange;
  kpis: {
    totalRevenueDzd: number;
    totalOrders: number;
    confirmedOrders: number;
    avgOrderValueDzd: number;
    newLeads: number;
    totalTraffic: number;
    confirmationRate: number;
  };
  revenueByDay: { date: string; revenueDzd: number; orders: number }[];
  statusBreakdown: { status: OrderStatus; count: number }[];
  topProducts: { slug: string; name: string; quantity: number; revenueDzd: number }[];
  topWilayas: { code: number; name: string; orders: number; revenueDzd: number }[];
  bestFunnels: { slug: string; title: string; views: number }[];
  bestOffers: { id: string; title: string; triggerProductName: string; offerProductName: string; orders: number; revenueDzd: number }[];
};

const RANGE_OPTIONS: { value: AnalyticsRange; label: string }[] = [
  { value: "today", label: "اليوم" },
  { value: "yesterday", label: "الأمس" },
  { value: "7d", label: "7 أيام" },
  { value: "30d", label: "30 يومًا" },
  { value: "all", label: "كل الفترة" },
];

function formatDayLabel(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("ar-DZ-u-nu-latn", { day: "numeric", month: "short" });
}

export default function AnalyticsDashboard() {
  const [range, setRange] = useState<AnalyticsRange>("30d");
  const [data, setData] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async (r: AnalyticsRange) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/analytics?range=${r}`);
      const json = await res.json();
      setData(json);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // جلب البيانات عند التحميل وعند تغيّر الفترة الزمنية — نمط قياسي، الإنذار غير دقيق هنا.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData(range);
  }, [range, fetchData]);

  const totalStatusCount = data?.statusBreakdown.reduce((sum, s) => sum + s.count, 0) ?? 0;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-2">
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
        </div>
        {loading && <Loader2 className="w-4 h-4 animate-spin text-gold" />}
      </div>

      {data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <KpiCard icon={ShoppingCart} label="الطلبيات" value={String(data.kpis.totalOrders)} />
            <KpiCard icon={Wallet} label="إيرادات المبيعات" value={formatPrice(data.kpis.totalRevenueDzd)} />
            <KpiCard icon={MousePointerClick} label="الترافيك الإجمالي" value={String(data.kpis.totalTraffic)} />
            <KpiCard icon={CheckCircle2} label="معدل التأكيد" value={`${data.kpis.confirmationRate}%`} />
          </div>

          <div className="grid lg:grid-cols-3 gap-6 mb-6">
            <div className="lg:col-span-2 rounded-xl gold-border bg-ink p-5">
              <h2 className="font-display font-semibold text-gold mb-4">الإيرادات عبر الزمن</h2>
              {data.revenueByDay.length === 0 ? (
                <p className="text-sm text-cream-dim py-10 text-center">لا توجد بيانات كافية بعد</p>
              ) : (
                <div style={{ width: "100%", height: 260 }}>
                  <ResponsiveContainer>
                    <LineChart data={data.revenueByDay}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(212,175,55,0.1)" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={formatDayLabel}
                        stroke="#a89a7d"
                        fontSize={11}
                      />
                      <YAxis stroke="#a89a7d" fontSize={11} width={70} tickFormatter={(v) => formatPrice(v)} />
                      <Tooltip
                        formatter={(value) => formatPrice(Number(value ?? 0))}
                        labelFormatter={(label) => formatDayLabel(String(label))}
                        contentStyle={{
                          background: "#0a0a0a",
                          border: "1px solid rgba(212,175,55,0.3)",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                      />
                      <Line type="monotone" dataKey="revenueDzd" stroke="#D4AF37" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="rounded-xl gold-border bg-ink p-5">
              <h2 className="font-display font-semibold text-gold mb-4">الطلبات حسب الحالة</h2>
              <div className="space-y-2.5">
                {data.statusBreakdown.map((s) => {
                  const meta = ORDER_STATUS_META[s.status];
                  const pct = totalStatusCount > 0 ? Math.round((s.count / totalStatusCount) * 100) : 0;
                  return (
                    <div key={s.status}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-cream-dim">{meta.label}</span>
                        <span className="text-cream-dim">{s.count} ({pct}%)</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-black/60 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${pct}%`, backgroundColor: meta.color }}
                        />
                      </div>
                    </div>
                  );
                })}
                {data.statusBreakdown.length === 0 && (
                  <p className="text-sm text-cream-dim py-6 text-center">لا توجد طلبات بعد</p>
                )}
              </div>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-6 mb-6">
            <div className="rounded-xl gold-border bg-ink p-5">
              <h2 className="font-display font-semibold text-gold mb-4">المنتجات الأكثر طلبًا</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-cream-dim text-xs border-b border-gold/15">
                    <th scope="col" className="p-2 text-start">المنتج</th>
                    <th scope="col" className="p-2 text-start">الكمية</th>
                    <th scope="col" className="p-2 text-start">الإيرادات</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topProducts.map((p) => (
                    <tr key={p.slug} className="border-b border-gold/10 last:border-0">
                      <td className="p-2 text-cream">{p.name}</td>
                      <td className="p-2 text-cream-dim">{p.quantity}</td>
                      <td className="p-2 text-gold font-semibold">{formatPrice(p.revenueDzd)}</td>
                    </tr>
                  ))}
                  {data.topProducts.length === 0 && (
                    <tr>
                      <td colSpan={3} className="p-6 text-center text-cream-dim">
                        لا توجد بيانات كافية بعد
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="rounded-xl gold-border bg-ink p-5">
              <h2 className="font-display font-semibold text-gold mb-4">أفضل صفحات الهبوط</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-cream-dim text-xs border-b border-gold/15">
                    <th scope="col" className="p-2 text-start">الصفحة</th>
                    <th scope="col" className="p-2 text-start">المشاهدات</th>
                  </tr>
                </thead>
                <tbody>
                  {data.bestFunnels.map((f) => (
                    <tr key={f.slug} className="border-b border-gold/10 last:border-0">
                      <td className="p-2 text-cream">{f.title}</td>
                      <td className="p-2 text-gold font-semibold">{f.views}</td>
                    </tr>
                  ))}
                  {data.bestFunnels.length === 0 && (
                    <tr>
                      <td colSpan={2} className="p-6 text-center text-cream-dim">
                        لا توجد بيانات كافية بعد
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <div className="rounded-xl gold-border bg-ink p-5">
              <h2 className="font-display font-semibold text-gold mb-4">أفضل الحزم والعروض</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-cream-dim text-xs border-b border-gold/15">
                    <th scope="col" className="p-2 text-start">العرض</th>
                    <th scope="col" className="p-2 text-start">مرات الاستخدام</th>
                    <th scope="col" className="p-2 text-start">الإيرادات</th>
                  </tr>
                </thead>
                <tbody>
                  {data.bestOffers.map((o) => (
                    <tr key={o.id} className="border-b border-gold/10 last:border-0">
                      <td className="p-2 text-cream">{o.title}</td>
                      <td className="p-2 text-cream-dim">{o.orders}</td>
                      <td className="p-2 text-gold font-semibold">{formatPrice(o.revenueDzd)}</td>
                    </tr>
                  ))}
                  {data.bestOffers.length === 0 && (
                    <tr>
                      <td colSpan={3} className="p-6 text-center text-cream-dim">
                        لا توجد بيانات كافية بعد
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="rounded-xl gold-border bg-ink p-5">
              <h2 className="font-display font-semibold text-gold mb-4">الأكثر طلبًا حسب الولاية</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-cream-dim text-xs border-b border-gold/15">
                    <th scope="col" className="p-2 text-start">الولاية</th>
                    <th scope="col" className="p-2 text-start">الطلبات</th>
                    <th scope="col" className="p-2 text-start">الإيرادات</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topWilayas.map((w) => (
                    <tr key={w.code} className="border-b border-gold/10 last:border-0">
                      <td className="p-2 text-cream">{w.name}</td>
                      <td className="p-2 text-cream-dim">{w.orders}</td>
                      <td className="p-2 text-gold font-semibold">{formatPrice(w.revenueDzd)}</td>
                    </tr>
                  ))}
                  {data.topWilayas.length === 0 && (
                    <tr>
                      <td colSpan={3} className="p-6 text-center text-cream-dim">
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

function KpiCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl gold-border bg-ink p-5">
      <div className="flex items-center justify-between mb-3">
        <Icon className="w-5 h-5 text-gold" strokeWidth={1.75} />
      </div>
      <p className="text-xl font-bold text-cream">{value}</p>
      <p className="text-xs text-cream-dim mt-1">{label}</p>
    </div>
  );
}
