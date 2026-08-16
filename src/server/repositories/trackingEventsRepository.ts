import { prisma } from "@/server/db/prisma";
import type { TrackingEventInput } from "@/lib/validation/trackingEventSchema";

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

export type PageScope = { pageKind: "product" | "landing"; platform?: "facebook" | "instagram" | "tiktok" };

// نجيب كل أحداث page_view/cta_click/form_submit لصنف صفحة معيّن (منتج أو هبوط)، اختياريًا
// مفلترة بمنصة — نحسب منها الزيارات/الارتداد/CTR في طبقة الخدمة بدل SQL معقّد.
export function listEventsForScope(scope: PageScope) {
  return prisma.trackingEvent.findMany({
    where: {
      pageKind: scope.pageKind,
      ...(scope.platform ? { platform: scope.platform } : {}),
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
