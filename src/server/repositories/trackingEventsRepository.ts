import { prisma } from "@/server/db/prisma";
import type { TrackingEventInput } from "@/lib/validation/trackingEventSchema";
import type { DateWindow } from "@/server/repositories/analyticsRepository";

export function recordTrackingEvent(input: TrackingEventInput) {
  return prisma.trackingEvent.create({
    data: {
      eventType: input.eventType,
      pageKind: input.pageKind,
      path: input.path,
      productSlug: input.productSlug,
      platform: input.platform ?? undefined,
      creativeName: input.creativeName ?? undefined,
      visitorId: input.visitorId,
    },
  });
}

// يحذف أحداث التتبّع الأقدم من الحد المطلوب — يمنع نمو الجدول بلا سقف مع تراكم الزيارات
// شهرًا بعد شهر (كل زيارة صفحة منتج/هبوط تُنشئ سطرًا جديدًا هنا).
export function deleteTrackingEventsOlderThan(cutoff: Date) {
  return prisma.trackingEvent.deleteMany({ where: { createdAt: { lt: cutoff } } });
}

export type PageScope = {
  pageKind: "product" | "landing";
  platform?: "facebook" | "instagram" | "tiktok";
  // اختياري عمدًا — بلا window (الوضع الافتراضي) يبقى السلوك مطابقًا تمامًا لما قبل هذا
  // الحقل (كل الأحداث بلا حد زمني)، فلا ينكسر أي استدعاء قائم (creative-analytics/
  // page-analytics القائمين مستقلَّين عن لوحة الأداء الشاملة).
  window?: DateWindow;
};

// نجيب كل أحداث page_view/cta_click/form_submit لصنف صفحة معيّن (منتج أو هبوط)، اختياريًا
// مفلترة بمنصة وبفترة زمنية — نحسب منها الزيارات/الارتداد/CTR في طبقة الخدمة بدل SQL معقّد.
export function listEventsForScope(scope: PageScope) {
  return prisma.trackingEvent.findMany({
    where: {
      pageKind: scope.pageKind,
      ...(scope.platform ? { platform: scope.platform } : {}),
      ...(scope.window?.start || scope.window?.end
        ? {
            createdAt: {
              ...(scope.window.start ? { gte: scope.window.start } : {}),
              ...(scope.window.end ? { lt: scope.window.end } : {}),
            },
          }
        : {}),
    },
    select: {
      eventType: true,
      path: true,
      productSlug: true,
      platform: true,
      visitorId: true,
    },
  });
}
