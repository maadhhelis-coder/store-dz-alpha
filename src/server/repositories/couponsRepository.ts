import { prisma } from "@/server/db/prisma";
import type { Prisma } from "@prisma/client";

export function listCoupons() {
  return prisma.coupon.findMany({ orderBy: { createdAt: "desc" } });
}

export type ListCouponsPageParams = { page: number; pageSize: number };

// نسخة مقسّمة صفحات من listCoupons أعلاه — الكوبونات مورد ينمو واقعيًا (كود جديد لكل
// حملة إعلانية)، فإعادة القائمة كاملة بلا حد أقصى فـ/api/admin/coupons كانت ستُصبح
// استجابة غير محدودة الحجم مع النمو.
export async function listCouponsPage(params: ListCouponsPageParams) {
  const [items, total] = await Promise.all([
    prisma.coupon.findMany({
      orderBy: { createdAt: "desc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.coupon.count(),
  ]);
  return { items, total };
}

export function findCouponByCode(code: string) {
  return prisma.coupon.findUnique({ where: { code } });
}

export function findCouponById(id: string) {
  return prisma.coupon.findUnique({ where: { id } });
}

export function createCoupon(data: Prisma.CouponCreateInput) {
  return prisma.coupon.create({ data });
}

export function updateCoupon(id: string, data: Prisma.CouponUpdateInput) {
  return prisma.coupon.update({ where: { id }, data });
}

export function deleteCoupon(id: string) {
  return prisma.coupon.delete({ where: { id } });
}

