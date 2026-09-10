import { revalidateTag } from "next/cache";
import { prisma } from "@/server/db/prisma";
import * as productsRepository from "@/server/repositories/productsRepository";
import { PRODUCTS_TAG } from "@/lib/storefrontData";
import type { ProductCreateInput, ProductUpdateInput } from "@/lib/validation/productSchema";

// صفحة المنتج تقرأ عبر unstable_cache بوسم PRODUCTS_TAG، فبلا هذا الإبطال يظلّ
// الزائر يرى النسخة القديمة حتى تنتهي مهلة revalidate. يُستدعى بعد كل كتابة ناجحة
// — إنشاء وتعديل وحذف — لا في مسار واحد فقط.
export function revalidateStorefrontProducts() {
  // Next 16 يطلب profile ثانيًا (كان وسيطًا واحدًا فـ15). "max" = أقصى إبطال:
  // النسخة المخزَّنة تُعدّ منتهية فورًا فيقرأ الطلب التالي من القاعدة.
  // updateTag البديلة تعمل داخل Server Actions فقط، وكتاباتنا في Route Handlers.
  //
  // try/catch هنا لا فوق كل مستدعٍ: بعض المسارات تُنفَّذ خارج نطاق طلب (مصرّف
  // صندوق الأحداث مثلًا) وrevalidateTag ترمي هناك. فشل الإبطال يعني بيانات أقدم
  // بثوانٍ — لا يصحّ أن يُسقط عملية تجارية ناجحة معه.
  try {
    revalidateTag(PRODUCTS_TAG, "max");
  } catch (error) {
    console.warn("revalidate storefront products skipped", (error as Error).message);
  }
}

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
  }).then((product) => {
    revalidateStorefrontProducts();
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
  }).then((product) => {
    revalidateStorefrontProducts();
    return product;
  });
}

export async function softDeleteProduct(id: string) {
  const existing = await productsRepository.findProductById(id);
  if (!existing) throw new ProductNotFoundError();
  const deleted = await productsRepository.softDeleteProduct(id);
  revalidateStorefrontProducts();
  return deleted;
}
