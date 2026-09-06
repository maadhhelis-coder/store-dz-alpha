import { prisma } from "@/server/db/prisma";

// بيانات اختبار العملاء — كل صف يحمل وسم التشغيلة في اسم العميل/رقم الطلب،
// والتنظيف يمسح بالوسم حصرًا فلا يلمس أي بيانات أخرى مهما فشلت تشغيلة سابقة
// في المنتصف. الهواتف فريدة عالميًا (قيد قاعدة) فتُشتق من عدّاد + وسم التشغيلة.

export type FixtureTag = string;

export function newTag(prefix: string): FixtureTag {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

// قاعدة عشوائية لكل وحدة + عدّاد تصاعدي — بلا أي اعتماد على ساعة الحائط.
// النسخة السابقة اشتقت الرقم من Date.now()%1e6 مع عدّاد يُصفَّر لكل ملف اختبار
// (vitest يعيد إنشاء الوحدة لكل ملف)، فملفان يولّدان رقمًا في نفس الميلي ثانية
// ينتجان نفس الهاتف ⇒ انتهاك القيد الفريد phone_normalized. فشل فعليًا على main.
const PHONE_BASE = 10_000_000 + Math.floor(Math.random() * 89_000_000);
let phoneSeq = 0;

/** هاتف جزائري صالح الشكل وفريد داخل التشغيلة (10 أرقام تبدأ 05). */
export function nextPhone(): string {
  phoneSeq += 1;
  const value = (PHONE_BASE + phoneSeq) % 100_000_000;
  return `05${value.toString().padStart(8, "0")}`;
}

export async function ensureWilayaCode(): Promise<number> {
  const wilaya = await prisma.wilaya.findFirst({ select: { code: true } });
  if (!wilaya) {
    throw new Error("لا ولايات في قاعدة الاختبار — شغّل node --import tsx prisma/seed.ts أولًا");
  }
  return wilaya.code;
}

export async function createAdmin(tag: FixtureTag): Promise<string> {
  const admin = await prisma.adminUser.create({
    data: {
      authUserId: `auth-${tag}`,
      email: `${tag}@test.invalid`,
      fullName: `أدمن ${tag}`,
      role: "admin",
    },
    select: { id: true },
  });
  return admin.id;
}

/** عميل نشط بهاتف أساسي واحد في customer_phones (الهوية الرسمية). */
export async function createCustomer(
  tag: FixtureTag,
  overrides: { phone?: string; status?: "active" | "archived" | "blacklisted" } = {},
): Promise<{ id: string; phone: string }> {
  const phone = overrides.phone ?? nextPhone();
  const customer = await prisma.customer.create({
    data: {
      fullName: `عميل ${tag}`,
      primaryPhone: phone,
      status: overrides.status ?? "active",
      phones: { create: { phoneNormalized: phone, phoneType: "primary", source: "test" } },
    },
    select: { id: true },
  });
  return { id: customer.id, phone };
}

export async function createOrder(
  tag: FixtureTag,
  input: {
    customerId: string | null;
    wilayaCode: number;
    totalDzd?: number;
    isTest?: boolean;
    status?: "pending" | "delivered" | "cancelled";
    deliveredAt?: Date | null;
    returnedAt?: Date | null;
    codCollectedAt?: Date | null;
    codCollectedAmountDzd?: number | null;
    deliveryPriceDzd?: number;
    packagingCostDzd?: number;
    otherCostDzd?: number;
    createdAt?: Date;
    itemUnitCostDzd?: number | null;
  },
): Promise<string> {
  const order = await prisma.order.create({
    data: {
      orderNumber: `IT-${tag}-${Math.random().toString(36).slice(2, 8)}`,
      customerId: input.customerId,
      status: input.status ?? "pending",
      customerFirstName: "اختبار",
      customerLastName: tag,
      phone: "0550000000",
      wilayaCode: input.wilayaCode,
      wilayaName: "اختبار",
      commune: "اختبار",
      deliveryOption: "home",
      deliveryPriceDzd: input.deliveryPriceDzd ?? 0,
      itemsSubtotalDzd: input.totalDzd ?? 1000,
      totalDzd: input.totalDzd ?? 1000,
      packagingCostDzd: input.packagingCostDzd ?? 0,
      otherCostDzd: input.otherCostDzd ?? 0,
      deliveredAt: input.deliveredAt ?? null,
      returnedAt: input.returnedAt ?? null,
      codCollectedAt: input.codCollectedAt ?? null,
      codCollectedAmountDzd: input.codCollectedAmountDzd ?? null,
      isTest: input.isTest ?? false,
      ...(input.createdAt ? { createdAt: input.createdAt } : {}),
      ...(input.itemUnitCostDzd !== undefined
        ? {
            items: {
              create: {
                productNameSnapshot: "منتج اختبار",
                productSlugSnapshot: "test-product",
                unitPriceDzd: input.totalDzd ?? 1000,
                unitCostDzd: input.itemUnitCostDzd,
                quantity: 1,
                lineTotalDzd: input.totalDzd ?? 1000,
              },
            },
          }
        : {}),
    },
    select: { id: true },
  });
  return order.id;
}

/** حذف كل ما أنشأه الوسم — بترتيب يحترم قيود FK (Restrict على الطلبات والدمج). */
export async function cleanupByTag(tag: FixtureTag): Promise<void> {
  const customers = await prisma.customer.findMany({
    where: { fullName: { contains: tag } },
    select: { id: true },
  });
  const customerIds = customers.map((c) => c.id);
  const orders = await prisma.order.findMany({
    where: { orderNumber: { contains: tag } },
    select: { id: true },
  });
  const orderIds = orders.map((o) => o.id);

  await prisma.financialAdjustment.deleteMany({
    where: { OR: [{ orderId: { in: orderIds } }, { customerId: { in: customerIds } }] },
  });
  await prisma.fraudSignal.deleteMany({
    where: { OR: [{ orderId: { in: orderIds } }, { customerId: { in: customerIds } }] },
  });
  await prisma.communication.deleteMany({
    where: { OR: [{ orderId: { in: orderIds } }, { customerId: { in: customerIds } }] },
  });
  await prisma.task.deleteMany({
    where: { OR: [{ orderId: { in: orderIds } }, { customerId: { in: customerIds } }] },
  });
  await prisma.confirmationAttempt.deleteMany({
    where: { OR: [{ orderId: { in: orderIds } }, { customerId: { in: customerIds } }] },
  });
  await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.customerMerge.deleteMany({
    where: { OR: [{ survivorId: { in: customerIds } }, { mergedId: { in: customerIds } }] },
  });
  await prisma.customerSegment.deleteMany({ where: { customerId: { in: customerIds } } });
  await prisma.customerPhone.deleteMany({ where: { customerId: { in: customerIds } } });
  await prisma.customer.deleteMany({ where: { id: { in: customerIds } } });
  await prisma.adminUser.deleteMany({ where: { email: { contains: tag } } });
  await prisma.auditLog.deleteMany({ where: { entityId: { in: customerIds } } });
  await prisma.idempotencyKey.deleteMany({ where: { idempotencyKey: { contains: tag } } });
}
