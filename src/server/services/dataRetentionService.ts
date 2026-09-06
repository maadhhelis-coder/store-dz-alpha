import { deleteTrackingEventsOlderThan } from "@/server/repositories/trackingEventsRepository";
import { deletePageViewsOlderThan } from "@/server/repositories/pageViewsRepository";
import { deleteWebVitalMetricsOlderThan } from "@/server/repositories/webVitalsRepository";
import { cleanupExpiredIdempotencyKeys } from "@/server/modules/idempotency/durableIdempotency";

// جداول التتبّع الخام (tracking_events, page_views) تنمو مع كل زيارة بلا سقف طبيعي — نافذة
// سنة كاملة تكفي بأريحية لكل نطاقات التحليلات الحالية (أقصاها "الكل" على لوحة التحكم، وهي
// عمليًا لا تتجاوز عمر المتجر نفسه)، وتمنع تضخّم الجدولين إلى ما لا نهاية على المدى الطويل.
const RETENTION_DAYS = 365;

export async function cleanupOldTrackingData() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);

  // مفاتيح idempotency المنتهية: الدالة كانت موجودة بلا أي مستدعٍ فالجدول ينمو
  // بلا حد. تُحذف بمهلتها هي (expiresAt < الآن) لا بمهلة التتبّع — عقد الـidempotency
  // يخص المفاتيح السارية وحدها، فحذف المنتهي لا يمس أي ضمان.
  const [trackingEvents, pageViews, webVitals, expiredIdempotencyKeys] = await Promise.all([
    deleteTrackingEventsOlderThan(cutoff),
    deletePageViewsOlderThan(cutoff),
    deleteWebVitalMetricsOlderThan(cutoff),
    cleanupExpiredIdempotencyKeys(),
  ]);

  return {
    deletedTrackingEvents: trackingEvents.count,
    deletedPageViews: pageViews.count,
    deletedWebVitals: webVitals.count,
    deletedExpiredIdempotencyKeys: expiredIdempotencyKeys,
    cutoff,
  };
}
