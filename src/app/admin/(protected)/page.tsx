import { ShoppingCart, Clock, TrendingUp, AlertTriangle, CheckCircle2, Truck, Wallet } from "lucide-react";
import { getDashboardStats } from "@/server/repositories/dashboardRepository";
import { formatPrice } from "@/lib/format";

export default async function AdminDashboardPage() {
  const stats = await getDashboardStats();

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
