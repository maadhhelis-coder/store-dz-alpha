import * as analyticsRepository from "@/server/repositories/analyticsRepository";
import type { AnalyticsRange } from "@/server/repositories/analyticsRepository";

export async function getAnalyticsOverview(range: AnalyticsRange) {
  const window = analyticsRepository.rangeToWindow(range);

  // استعلامات مستقلة تمامًا عن بعضها — تُنفَّذ بالتوازي الآن بعد التحول لـ transaction
  // pooler (راجع مذكرة الجلسة)، بدل الانتظار التسلسلي القديم الذي كان ضرورة حتمية زمن
  // session pooler محدود الاتصالات (15 اتصالاً).
  const [kpis, cpa, revenueByDay, statusBreakdown, topProducts, topWilayas, bestFunnels, bestOffers] =
    await Promise.all([
      analyticsRepository.getKpis(window),
      analyticsRepository.getCpaLast30Days(),
      analyticsRepository.getRevenueByDay(window),
      analyticsRepository.getStatusBreakdown(window),
      analyticsRepository.getTopProducts(window, 5),
      analyticsRepository.getTopWilayas(window, 10),
      analyticsRepository.getBestFunnels(window, 5),
      analyticsRepository.getBestOffers(window, 5),
    ]);

  return { range, kpis, cpa, revenueByDay, statusBreakdown, topProducts, topWilayas, bestFunnels, bestOffers };
}
