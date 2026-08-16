import { prisma } from "@/server/db/prisma";
import { getKpis, getCpaLast30Days } from "@/server/repositories/analyticsRepository";

export async function getDashboardStats() {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
  const thirtyDaysAgo = new Date(startOfToday);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const revenueStatuses = ["confirmed", "shipped", "delivered"] as const;

  const [ordersToday, pendingCount, weekRevenue, lowStockCount] = await Promise.all([
    prisma.order.count({ where: { createdAt: { gte: startOfToday } } }),
    prisma.order.count({ where: { status: "pending" } }),
    prisma.order.aggregate({
      where: { createdAt: { gte: startOfWeek }, status: { in: [...revenueStatuses] } },
      _sum: { totalDzd: true },
    }),
    prisma.product.count({ where: { isPublished: true, inventoryCount: { lte: 5 } } }),
  ]);

  // آخر 30 يومًا — يعيد استعمال نفس منطق صفحة التحليلات (راجع analyticsRepository) بدل
  // تكرار حساب معدل التأكيد/التسليم/CPA بنسخة ثانية قد تنحرف عن الأصل مع الوقت.
  const kpis30d = await getKpis({ start: thirtyDaysAgo });
  const cpa = await getCpaLast30Days();

  return {
    ordersToday,
    pendingCount,
    weekRevenueDzd: weekRevenue._sum.totalDzd ?? 0,
    lowStockCount,
    confirmationRate: kpis30d.confirmationRate,
    deliveryRate: kpis30d.deliveryRate,
    cpaDzd: cpa.cpaDzd,
  };
}
