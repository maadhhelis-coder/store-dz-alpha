import { prisma } from "@/server/db/prisma";
import type { Prisma } from "@prisma/client";

export type ListFunnelsParams = {
  page: number;
  pageSize: number;
  search?: string;
};

const funnelWithProduct = {
  include: {
    product: {
      include: {
        category: true,
        images: { orderBy: { sortOrder: "asc" } },
        variants: { orderBy: { sortOrder: "asc" } },
      },
    },
  },
} satisfies Prisma.FunnelDefaultArgs;

export async function listFunnels(params: ListFunnelsParams) {
  const where: Prisma.FunnelWhereInput = params.search
    ? { title: { contains: params.search, mode: "insensitive" } }
    : {};

  const [items, total] = await Promise.all([
    prisma.funnel.findMany({
      where,
      ...funnelWithProduct,
      orderBy: { createdAt: "desc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.funnel.count({ where }),
  ]);

  return { items, total };
}

export function findFunnelById(id: string) {
  return prisma.funnel.findUnique({ where: { id }, ...funnelWithProduct });
}

export function findFunnelBySlug(slug: string) {
  return prisma.funnel.findUnique({ where: { slug }, ...funnelWithProduct });
}

export function createFunnel(data: Prisma.FunnelCreateInput) {
  return prisma.funnel.create({ data, ...funnelWithProduct });
}

export function updateFunnel(id: string, data: Prisma.FunnelUpdateInput) {
  return prisma.funnel.update({ where: { id }, data, ...funnelWithProduct });
}

export function deleteFunnel(id: string) {
  return prisma.funnel.delete({ where: { id } });
}

export function incrementFunnelViews(id: string) {
  return prisma.funnel.update({ where: { id }, data: { views: { increment: 1 } } });
}
