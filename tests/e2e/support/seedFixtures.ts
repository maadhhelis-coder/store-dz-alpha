import { testPrisma } from "./testPrisma";
import { e2eSlug, e2eName } from "./testData";

export async function getActiveWilaya() {
  const wilaya = await testPrisma.wilaya.findFirst({ where: { isActive: true, homePriceDzd: { gt: 0 } } });
  if (!wilaya) throw new Error("لا توجد ولاية نشطة فقاعدة الاختبار — لا يمكن تشغيل اختبارات الطلب");
  return wilaya;
}

// wilayaCode مقيَّد بمخطط Zod إلى [1,58] (رموز ولايات جزائرية حقيقية فقط — راجع
// orderSchema.ts) — لا يمكن إنشاء صف ولاية وهمي برمز خارج هذا المدى ليختبر "ولاية غير
// نشطة" فعليًا (سيُرفض بـ400 لتجاوز المدى، وليس لعدم النشاط تحديدًا). البديل الصحيح: تعطيل
// ولاية حقيقية واحدة مؤقّتًا لمدة الاختبار فقط، ثم إعادتها لحالتها الأصلية دائمًا (finally) —
// لا بيانات وهمية تُترَك، ولا تعديل دائم على بيانات إنتاجية مشتركة. النافذة الزمنية للتعطيل
// قصيرة جدًا (طلب API واحد)، وworkers:1/fullyParallel:false يمنعان أي اختبار آخر من قراءة
// نفس الولاية أثناء ذلك.
export async function withTemporarilyInactiveWilaya<T>(fn: (wilaya: { code: number; name: string }) => Promise<T>): Promise<T> {
  const wilaya = await testPrisma.wilaya.findFirst({ where: { isActive: true } });
  if (!wilaya) throw new Error("لا توجد ولاية نشطة فقاعدة الاختبار لتعطيلها مؤقتًا");

  await testPrisma.wilaya.update({ where: { code: wilaya.code }, data: { isActive: false } });
  try {
    return await fn({ code: wilaya.code, name: wilaya.name });
  } finally {
    await testPrisma.wilaya.update({ where: { code: wilaya.code }, data: { isActive: true } });
  }
}

export async function createTestCategory() {
  return testPrisma.category.create({
    data: {
      slug: e2eSlug("category"),
      name: e2eName("Category"),
      shortDescription: "E2E test category",
      description: "E2E test category",
    },
  });
}

export type CreateTestProductOptions = {
  priceDzd?: number;
  inventoryCount?: number;
  isPublished?: boolean;
  categoryId?: string;
  badge?: "bestseller" | "new" | "sale";
};

export async function createTestProduct(options: CreateTestProductOptions = {}) {
  const categoryId = options.categoryId ?? (await createTestCategory()).id;
  return testPrisma.product.create({
    data: {
      slug: e2eSlug("product"),
      name: e2eName("Product"),
      categoryId,
      priceDzd: options.priceDzd ?? 2000,
      shortDescription: "منتج اختبار E2E — لا يُعرض لزبون حقيقي",
      longDescriptionHtml: "<p>منتج اختبار E2E</p>",
      inventoryCount: options.inventoryCount ?? 10,
      isPublished: options.isPublished ?? true,
      badge: options.badge,
    },
  });
}

export async function createTestProductWithVariant(options: CreateTestProductOptions = {}) {
  const product = await createTestProduct(options);
  const variant = await testPrisma.productVariant.create({
    data: {
      productId: product.id,
      name: "اللون",
      value: "أحمر",
      inventoryCount: options.inventoryCount ?? 10,
    },
  });
  return { product, variant };
}

export async function createTestCoupon(options: {
  type?: "percentage" | "fixed";
  value?: number;
  usageLimit?: number | null;
  minOrderDzd?: number;
  expiresAt?: Date | null;
  isActive?: boolean;
} = {}) {
  const code = `E2E${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1000)}`;
  return testPrisma.coupon.create({
    data: {
      code,
      type: options.type ?? "percentage",
      value: options.value ?? 10,
      usageLimit: options.usageLimit === undefined ? null : options.usageLimit,
      usedCount: 0,
      minOrderDzd: options.minOrderDzd ?? 0,
      expiresAt: options.expiresAt === undefined ? null : options.expiresAt,
      isActive: options.isActive ?? true,
    },
  });
}

export async function createTestFunnel(productId: string, options: { pageType?: "funnel" | "product_page" } = {}) {
  const pageType = options.pageType ?? "funnel";
  return testPrisma.funnel.create({
    data: {
      slug: e2eSlug("funnel"),
      title: e2eName("Funnel"),
      productId,
      pageType,
      headline: "عنوان اختبار E2E",
      subheadline: "عنوان فرعي اختبار E2E",
      bullets: pageType === "funnel" ? ["ميزة اختبار أولى", "ميزة اختبار ثانية", "ميزة اختبار ثالثة"] : [],
      isPublished: true,
    },
  });
}

export async function createTestOffer(triggerProductId: string, offerProductId: string, offerPriceDzd = 500) {
  return testPrisma.offer.create({
    data: {
      title: e2eName("Offer"),
      triggerProductId,
      offerProductId,
      offerPriceDzd,
      isActive: true,
    },
  });
}
