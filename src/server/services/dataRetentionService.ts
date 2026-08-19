import { deleteTrackingEventsOlderThan } from "@/server/repositories/trackingEventsRepository";
import { deletePageViewsOlderThan } from "@/server/repositories/pageViewsRepository";
import { deleteWebVitalMetricsOlderThan } from "@/server/repositories/webVitalsRepository";

// جداول التتبّع الخام (tracking_events, page_views) تنمو مع كل زيارة بلا سقف طبيعي — نافذة
// سنة كاملة تكفي بأريحية لكل نطاقات التحليلات الحالية (أقصاها "الكل" على لوحة التحكم، وهي
// عمليًا لا تتجاوز عمر المتجر نفسه)، وتمنع تضخّم الجدولين إلى ما لا نهاية على المدى الطويل.
const RETENTION_DAYS = 365;

export async function cleanupOldTrackingData() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);

  const [trackingEvents, pageViews, webVitals] = await Promise.all([
    deleteTrackingEventsOlderThan(cutoff),
    deletePageViewsOlderThan(cutoff),
    deleteWebVitalMetricsOlderThan(cutoff),
  ]);

  return {
    deletedTrackingEvents: trackingEvents.count,
    deletedPageViews: pageViews.count,
    deletedWebVitals: webVitals.count,
    cutoff,
  };
}
