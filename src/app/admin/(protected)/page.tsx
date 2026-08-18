import { ShoppingCart, Clock, TrendingUp, AlertTriangle, CheckCircle2, Truck, Wallet, ShieldAlert } from "lucide-react";
import { getDashboardStats, getUnresolvedAlerts } from "@/server/repositories/dashboardRepository";
import { formatPrice } from "@/lib/format";

const ALERT_TYPE_LABELS: Record<string, string> = {
  rate_limit_fail_open: "تعطّل نظام تحديد المعدل",
};

export default async function AdminDashboardPage() {
  const stats = await getDashboardStats();
  const alerts = await getUnresolvedAlerts();

  const cards = [
    {
      label: "طلبات اليوم",
      value: stats.ordersToday.toString(),
      icon: ShoppingCart,
    },
    {
      label: "طلبات قيد الانتظار",
      value: stats.pendingCount.toString(),
      icon: Clock,
    },
    {
      label: "إيرادات هذا الأسبوع",
      value: formatPrice(stats.weekRevenueDzd),
      icon: TrendingUp,
    },
    {
      label: "منتجات على وشك النفاد",
      value: stats.lowStockCount.toString(),
      icon: AlertTriangle,
    },
  ];

  const performanceCards = [
    {
      label: "معدل التأكيد (٣٠ يوم)",
      value: `${stats.confirmationRate}%`,
      icon: CheckCircle2,
    },
    {
      label: "معدل التسليم (٣٠ يوم)",
      value: `${stats.deliveryRate}%`,
      icon: Truck,
    },
    {
      label: "تكلفة اكتساب الطلب (٣٠ يوم)",
      value: stats.cpaDzd !== null ? formatPrice(stats.cpaDzd) : "—",
      icon: Wallet,
    },
  ];

  return (
    <div>
      <h1 className="font-display text-xl font-bold text-cream mb-6">الرئيسية</h1>

      {alerts.length > 0 && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <ShieldAlert className="w-5 h-5 text-red-400" strokeWidth={1.75} />
            <p className="text-sm font-bold text-cream">تنبيهات تشغيلية تحتاج مراجعة</p>
          </div>
          <ul className="space-y-2">
            {alerts.map((alert) => (
              <li key={alert.id} className="text-xs text-cream-dim">
                <span className="text-cream">{ALERT_TYPE_LABELS[alert.type] ?? alert.type}</span>
                {" — "}
                {alert.message}
                {" · "}
                {new Date(alert.createdAt).toLocaleString("ar-DZ-u-nu-latn")}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl gold-border bg-ink p-5">
            <div className="flex items-center justify-between mb-3">
              <card.icon className="w-5 h-5 text-gold" strokeWidth={1.75} />
            </div>
            <p className="text-2xl font-bold text-cream">{card.value}</p>
            <p className="text-xs text-cream-dim mt-1">{card.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {performanceCards.map((card) => (
          <div key={card.label} className="rounded-xl gold-border bg-ink p-5">
            <div className="flex items-center justify-between mb-3">
              <card.icon className="w-5 h-5 text-gold" strokeWidth={1.75} />
            </div>
            <p className="text-2xl font-bold text-cream">{card.value}</p>
            <p className="text-xs text-cream-dim mt-1">{card.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
