import { prisma } from "@/server/db/prisma";
import * as productsRepository from "@/server/repositories/productsRepository";
import type { ProductCreateInput, ProductUpdateInput } from "@/lib/validation/productSchema";

export class ProductNotFoundError extends Error {
  constructor() {
    super("المنتج غير موجود");
    this.name = "ProductNotFoundError";
  }
}

export function listProducts(params: productsRepository.ListProductsParams) {
  return productsRepository.listProducts(params);
}

export async function getProduct(id: string) {
  const product = await productsRepository.findProductById(id);
  if (!product) throw new ProductNotFoundError();
  return product;
}

export async function createProduct(input: ProductCreateInput) {
  const { images, variants, categoryId, ...productData } = input;

  return prisma.$transaction(async (tx) => {
    const product = await tx.product.create({
      data: {
        ...productData,
        category: { connect: { id: categoryId } },
        images: { create: images.map((img, i) => ({ ...img, sortOrder: img.sortOrder ?? i })) },
        variants: { create: variants },
      },
      include: { category: true, images: true, variants: true },
    });
    return product;
  });
}

export async function updateProduct(id: string, input: ProductUpdateInput) {
  const existing = await productsRepository.findProductById(id);
  if (!existing) throw new ProductNotFoundError();

  const { images, variants, categoryId, ...productData } = input;

  return prisma.$transaction(async (tx) => {
    await tx.product.update({
      where: { id },
      data: {
        ...productData,
        ...(categoryId ? { category: { connect: { id: categoryId } } } : {}),
        ...(input.howToUse !== undefined ? { howToUse: input.howToUse } : {}),
      },
    });

    if (images) {
      await tx.productImage.deleteMany({ where: { productId: id } });
      if (images.length > 0) {
        await tx.productImage.createMany({
          data: images.map((img, i) => ({ ...img, productId: id, sortOrder: img.sortOrder ?? i })),
        });
      }
    }

    if (variants) {
      await tx.productVariant.deleteMany({ where: { productId: id } });
      if (variants.length > 0) {
        await tx.productVariant.createMany({
          data: variants.map((v, i) => ({ ...v, productId: id, sortOrder: v.sortOrder ?? i })),
        });
      }
    }

    return tx.product.findUniqueOrThrow({
      where: { id },
      include: { category: true, images: true, variants: true },
    });
  });
}

export async function softDeleteProduct(id: string) {
  const existing = await productsRepository.findProductById(id);
  if (!existing) throw new ProductNotFoundError();
  return productsRepository.softDeleteProduct(id);
}
