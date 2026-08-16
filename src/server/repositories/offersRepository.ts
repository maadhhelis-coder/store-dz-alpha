import { prisma } from "@/server/db/prisma";
import type { Prisma } from "@prisma/client";

export type ListOffersParams = {
  page: number;
  pageSize: number;
};

const offerWithProducts = {
  include: {
    triggerProduct: { include: { images: { orderBy: { sortOrder: "asc" }, take: 1 } } },
    offerProduct: { include: { images: { orderBy: { sortOrder: "asc" }, take: 1 } } },
  },
} satisfies Prisma.OfferDefaultArgs;

export async function listOffers(params: ListOffersParams) {
  const items = await prisma.offer.findMany({
    ...offerWithProducts,
    orderBy: { createdAt: "desc" },
    skip: (params.page - 1) * params.pageSize,
    take: params.pageSize,
  });
  const total = await prisma.offer.count();

  return { items, total };
}

export function findOfferById(id: string) {
  return prisma.offer.findUnique({ where: { id }, ...offerWithProducts });
}

export function createOffer(data: Prisma.OfferCreateInput) {
  return prisma.offer.create({ data, ...offerWithProducts });
}

export function updateOffer(id: string, data: Prisma.OfferUpdateInput) {
  return prisma.offer.update({ where: { id }, data, ...offerWithProducts });
}

export function deleteOffer(id: string) {
  return prisma.offer.delete({ where: { id } });
}

// نتحقق من isPublished وinventoryCount لمنتج العرض نفسه (وليس فقط منتج التشغيل) — بلا
// هذا، الزبون يرى ويقبل عرضًا لمنتج إضافي معطَّل/نافد المخزون؛ ordersService.createOrder
// يتجاهله بصمت عند إنشاء الطلب فعليًا (بالتصميم، حتى لا يُفشِل الطلب الأساسي)، فيظهر
// للزبون فشاشة التأكيد أنه سيستلم منتجًا لن يُشحَن له أبدًا.
export function findActiveOffersByTriggerSlug(productSlug: string) {
  return prisma.offer.findMany({
    where: {
      isActive: true,
      triggerProduct: { slug: productSlug, isPublished: true },
      offerProduct: { isPublished: true, inventoryCount: { gte: 1 } },
    },
    include: {
      offerProduct: { include: { images: { orderBy: { sortOrder: "asc" }, take: 1 } } },
    },
    orderBy: { sortOrder: "asc" },
  });
}
