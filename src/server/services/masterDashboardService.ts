import * as analyticsRepository from "@/server/repositories/analyticsRepository";
import * as masterDashboardRepository from "@/server/repositories/masterDashboardRepository";
import * as webVitalsRepository from "@/server/repositories/webVitalsRepository";
import { getStoreWideRates, getCreativeAnalytics } from "@/server/services/creativeAnalyticsService";
import { getProductPageAnalytics, getLandingPageAnalytics } from "@/server/services/pageAnalyticsService";
import type { AnalyticsRange, MasterFilters } from "@/server/repositories/analyticsRepository";

// كل هذه الاستعلامات مستقلة تمامًا عن بعضها — بالتوازي (راجع مذكرة الجلسة: DATABASE_URL على
// transaction pooler الآن، Promise.all آمن). لا نعيد تنفيذ أي منطق موجود فعليًا فطبقات
// أخرى (getKpis، getCreativeAnalytics، getProductPageAnalytics...) — هذه الدالة فقط تجمعها
// مع المقاييس الجديدة (الربح/الإرجاع/الإلغاء/ROAS/Core Web Vitals/مقارنة الفترات/التنبيهات).
//
// فلتر منتج/ولاية (filters) يطال KPIs الرئيسية + الربح + معدلات الإرجاع/الإلغاء + جدول أداء
// المنتجات (ولاية فقط هناك) — لا يطال cpa/roas (AdSpendEntry بلا بُعد منتج/ولاية إطلاقًا) ولا
// creativeAnalytics/productPageAnalytics/landingPageAnalytics/webVitals/topProducts/topWilayas
// (مقسّمة أصلًا حسب منصة/منتج/ولاية بذاتها)، ولا periodComparison/alerts (تقارن اتجاهات
// عامة للمتجر كله بقصد اكتشاف انخفاض شامل، لا لمنتج/ولاية واحدة).
export async function getMasterDashboard(range: AnalyticsRange, filters?: MasterFilters) {
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
    analyticsRepository.getKpis(window, filters),
    analyticsRepository.getCpaLast30Days(),
    analyticsRepository.getTopProducts(window, 10),
    analyticsRepository.getTopWilayas(window, 10),
    getStoreWideRates(window),
    getCreativeAnalytics(window),
    getProductPageAnalytics(window),
    getLandingPageAnalytics(window),
    webVitalsRepository.getWebVitalsSummary(window),
    masterDashboardRepository.getProfitMetrics(window, filters),
    masterDashboardRepository.getReturnRate(window, filters),
    masterDashboardRepository.getCancellationRate(window, filters),
    masterDashboardRepository.getRoasLast30Days(),
    masterDashboardRepository.getProductPerformanceTable(window, filters),
    masterDashboardRepository.getPeriodComparison(range),
    masterDashboardRepository.getAlerts(),
  ]);

  return {
    range,
    filters: filters ?? {},
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
