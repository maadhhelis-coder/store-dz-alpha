import { prisma } from "@/server/db/prisma";

export function recordPageView(path: string) {
  return prisma.pageView.create({ data: { path } });
}

export function countPageViews(startDate?: Date, endDate?: Date) {
  return prisma.pageView.count({
    where: {
      ...(startDate || endDate
        ? { createdAt: { ...(startDate ? { gte: startDate } : {}), ...(endDate ? { lt: endDate } : {}) } }
        : {}),
    },
  });
}

// يحذف مشاهدات الصفحات الأقدم من الحد المطلوب — نفس منطق تنظيف TrackingEvent، لمنع نمو
// page_views بلا سقف (كل تحميل صفحة يُنشئ سطرًا).
export function deletePageViewsOlderThan(cutoff: Date) {
  return prisma.pageView.deleteMany({ where: { createdAt: { lt: cutoff } } });
}
