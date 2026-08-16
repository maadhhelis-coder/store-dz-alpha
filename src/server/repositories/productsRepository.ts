import { prisma } from "@/server/db/prisma";
import type { Prisma } from "@prisma/client";

export type ListProductsParams = {
  page: number;
  pageSize: number;
  search?: string;
  categoryId?: string;
  inStock?: boolean;
  isPublished?: boolean;
};

const productWithRelations = {
  include: {
    category: true,
    images: { orderBy: { sortOrder: "asc" } },
    variants: { orderBy: { sortOrder: "asc" } },
  },
} satisfies Prisma.ProductDefaultArgs;

export async function listProducts(params: ListProductsParams) {
  const where: Prisma.ProductWhereInput = {
    ...(params.search
      ? { name: { contains: params.search, mode: "insensitive" } }
      : {}),
    ...(params.categoryId ? { categoryId: params.categoryId } : {}),
    ...(params.inStock !== undefined ? { inStock: params.inStock } : {}),
    ...(params.isPublished !== undefined ? { isPublished: params.isPublished } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      ...productWithRelations,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.product.count({ where }),
  ]);

  return { items, total };
}

export function findProductById(id: string) {
  return prisma.product.findUnique({ where: { id }, ...productWithRelations });
}

export function findProductBySlug(slug: string) {
  return prisma.product.findUnique({ where: { slug }, ...productWithRelations });
}

export function createProduct(data: Prisma.ProductCreateInput) {
  return prisma.product.create({ data, ...productWithRelations });
}

export function updateProduct(id: string, data: Prisma.ProductUpdateInput) {
  return prisma.product.update({ where: { id }, data, ...productWithRelations });
}

export function softDeleteProduct(id: string) {
  return prisma.product.update({ where: { id }, data: { isPublished: false } });
}

export function replaceProductImages(
  productId: string,
  images: { url: string; altText?: string | null; sortOrder: number }[],
) {
  return prisma.$transaction([
    prisma.productImage.deleteMany({ where: { productId } }),
    prisma.productImage.createMany({
      data: images.map((img) => ({ ...img, productId })),
    }),
  ]);
}

export function decrementInventory(
  tx: Prisma.TransactionClient,
  productId: string,
  quantity: number,
) {
  return tx.product.update({
    where: { id: productId },
    data: { inventoryCount: { decrement: quantity } },
  });
}
