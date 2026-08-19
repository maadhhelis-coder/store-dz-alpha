import * as analyticsRepository from "@/server/repositories/analyticsRepository";
import * as masterDashboardRepository from "@/server/repositories/masterDashboardRepository";
import * as webVitalsRepository from "@/server/repositories/webVitalsRepository";
import { getStoreWideRates, getCreativeAnalytics } from "@/server/services/creativeAnalyticsService";
import { getProductPageAnalytics, getLandingPageAnalytics } from "@/server/services/pageAnalyticsService";
import type { AnalyticsRange } from "@/server/repositories/analyticsRepository";

// كل هذه الاستعلامات مستقلة تمامًا عن بعضها — بالتوازي (راجع مذكرة الجلسة: DATABASE_URL على
// transaction pooler الآن، Promise.all آمن). لا نعيد تنفيذ أي منطق موجود فعليًا فطبقات
// أخرى (getKpis، getCreativeAnalytics، getProductPageAnalytics...) — هذه الدالة فقط تجمعها
// مع المقاييس الجديدة (الربح/الإرجاع/الإلغاء/ROAS/Core Web Vitals/مقارنة الفترات/التنبيهات).
export async function getMasterDashboard(range: AnalyticsRange) {
  const window = analyticsRepository.rangeToWindow(range);

  const [
    kpis,
    cpa,
    topProducts,
    topWilayas,
    storeWideRates,
    creativeAnalytics,
    productPageAnalytics,
    landingPageAnalytics,
    webVitals,
    profitMetrics,
    returnRate,
    cancellationRate,
    roas,
    productPerformance,
    periodComparison,
    alerts,
  ] = await Promise.all([
    analyticsRepository.getKpis(window),
    analyticsRepository.getCpaLast30Days(),
    analyticsRepository.getTopProducts(window, 10),
    analyticsRepository.getTopWilayas(window, 10),
    getStoreWideRates(),
    getCreativeAnalytics(),
    getProductPageAnalytics(),
    getLandingPageAnalytics(),
    webVitalsRepository.getWebVitalsSummary(window),
    masterDashboardRepository.getProfitMetrics(window),
    masterDashboardRepository.getReturnRate(window),
    masterDashboardRepository.getCancellationRate(window),
    masterDashboardRepository.getRoasLast30Days(),
    masterDashboardRepository.getProductPerformanceTable(window),
    masterDashboardRepository.getPeriodComparison(range),
    masterDashboardRepository.getAlerts(),
  ]);

  return {
    range,
    kpis,
    cpa,
    topProducts,
    topWilayas,
    storeWideRates,
    creativeAnalytics,
    productPageAnalytics,
    landingPageAnalytics,
    webVitals,
    profitMetrics,
    returnRate,
    cancellationRate,
    roas,
    productPerformance,
    periodComparison,
    alerts,
  };
}
