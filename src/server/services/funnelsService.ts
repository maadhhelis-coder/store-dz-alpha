import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import * as funnelsRepository from "@/server/repositories/funnelsRepository";
import type { FunnelCreateInput, FunnelUpdateInput } from "@/lib/validation/funnelSchema";

export class FunnelNotFoundError extends Error {
  constructor() {
    super("صفحة الهبوط غير موجودة");
    this.name = "FunnelNotFoundError";
  }
}

export class FunnelSlugTakenError extends Error {
  constructor() {
    super("هذا الرابط مستخدم من قبل صفحة هبوط أخرى");
    this.name = "FunnelSlugTakenError";
  }
}

export class InsufficientBulletsError extends Error {
  constructor() {
    super("لا يمكن نشر صفحة هبوط بأقل من 3 نقاط إقناعية (bullets)");
    this.name = "InsufficientBulletsError";
  }
}

export class ProductNotPublishedError extends Error {
  constructor() {
    super("لا يمكن نشر صفحة هبوط لمنتج غير منشور");
    this.name = "ProductNotPublishedError";
  }
}

const MIN_BULLETS_TO_PUBLISH = 3;

// يمنع نشر صفحة فانل (pageType: "funnel") بلا حد أدنى من نقاط الإقناع — صفحة هبوط
// إعلانية بلا أي bullets تحوّل ضعيف جدًا. لا ينطبق على pageType: "product_page" لأنها
// لا تعرض bullets أصلًا (تفوّض العرض بالكامل لـProductDetail).
function assertPublishable(pageType: string | undefined, bullets: unknown, isPublished: boolean | undefined) {
  if (!isPublished || pageType !== "funnel") return;
  const count = Array.isArray(bullets) ? bullets.length : 0;
  if (count < MIN_BULLETS_TO_PUBLISH) throw new InsufficientBulletsError();
}

// يمنع نشر صفحة هبوط (أي pageType) تُشير لمنتج غير منشور — بلا هذا، /lp/[slug] يُصيَّر
// المنتج كاملًا (السعر، الطلب...) رغم أن المتجر أخفاه من الكتالوج العام عمدًا، فيصل
// رابط إعلاني حي لمنتج المفروض غير معروض.
async function assertProductPublished(productId: string, isPublished: boolean | undefined) {
  if (!isPublished) return;
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { isPublished: true } });
  if (!product || !product.isPublished) throw new ProductNotPublishedError();
}

export function listFunnels(params: funnelsRepository.ListFunnelsParams) {
  return funnelsRepository.listFunnels(params);
}

export async function getFunnel(id: string) {
  const funnel = await funnelsRepository.findFunnelById(id);
  if (!funnel) throw new FunnelNotFoundError();
  return funnel;
}

export async function getPublishedFunnelBySlug(slug: string) {
  const funnel = await funnelsRepository.findFunnelBySlug(slug);
  if (!funnel || !funnel.isPublished) return null;
  return funnel;
}

export async function createFunnel(input: FunnelCreateInput) {
  const { productId, bullets, ...data } = input;
  assertPublishable(data.pageType, bullets, data.isPublished);
  await assertProductPublished(productId, data.isPublished);
  try {
    return await funnelsRepository.createFunnel({
      ...data,
      bullets,
      product: { connect: { id: productId } },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new FunnelSlugTakenError();
    }
    throw error;
  }
}

export async function updateFunnel(id: string, input: FunnelUpdateInput) {
  const existing = await funnelsRepository.findFunnelById(id);
  if (!existing) throw new FunnelNotFoundError();

  const { productId, ...data } = input;
  const targetIsPublished = data.isPublished ?? existing.isPublished;
  assertPublishable(data.pageType ?? existing.pageType, data.bullets ?? existing.bullets, targetIsPublished);
  if (productId) {
    await assertProductPublished(productId, targetIsPublished);
  } else if (targetIsPublished && !existing.product.isPublished) {
    throw new ProductNotPublishedError();
  }
  try {
    return await funnelsRepository.updateFunnel(id, {
      ...data,
      ...(productId ? { product: { connect: { id: productId } } } : {}),
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new FunnelSlugTakenError();
    }
    throw error;
  }
}

export async function deleteFunnel(id: string) {
  const existing = await funnelsRepository.findFunnelById(id);
  if (!existing) throw new FunnelNotFoundError();
  return funnelsRepository.deleteFunnel(id);
}

export function incrementFunnelViews(id: string) {
  return funnelsRepository.incrementFunnelViews(id);
}
