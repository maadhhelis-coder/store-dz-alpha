import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { E2E_LAST_NAME_TAG, E2E_PREFIX } from "./testData";
// نعيد استعمال عميل Prisma نفسه المُهيَّأ فالتطبيق (Prisma 7 يتطلب driver adapter صريح —
// راجع src/server/db/prisma.ts) بدل تكرار إعداد الـadapter هنا — يُستعمل لإنشاء بيانات
// تمهيدية والتحقق من قاعدة البيانات مباشرة بعد كل اختبار، وليس فقط الاكتفاء برسالة نجاح
// تظهر بالواجهة، تمامًا كما طلب التدقيق.
import { prisma as testPrismaClient } from "../../../src/server/db/prisma";

export const testPrisma = testPrismaClient;

// حذف شامل لكل بيانات E2E (بأي بادئة/علامة معروفة) — يُستدعى فبداية التشغيل (لتنظيف بقايا
// تشغيل سابق تعطّل قبل تنظيف نفسه) وفنهايته (globalTeardown). آمن للتكرار (idempotent).
export async function sweepAllE2EData(): Promise<{
  orders: number;
  leads: number;
  orderItems: number;
  products: number;
  categories: number;
  coupons: number;
  offers: number;
  funnels: number;
}> {
  // الطلبات أولًا (orderItems تُحذف تلقائيًا معها عبر onDelete: Cascade)
  const orders = await testPrisma.order.findMany({
    where: { OR: [{ customerLastName: { startsWith: E2E_LAST_NAME_TAG } }, { phone: { startsWith: "0555" } }] },
    select: { id: true },
  });
  const orderIds = orders.map((o) => o.id);
  const orderItemsDeleted = orderIds.length
    ? (await testPrisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } })).count
    : 0;
  const ordersDeleted = orderIds.length
    ? (await testPrisma.order.deleteMany({ where: { id: { in: orderIds } } })).count
    : 0;

  const leadsDeleted = (
    await testPrisma.lead.deleteMany({
      where: { OR: [{ lastName: { startsWith: E2E_LAST_NAME_TAG } }, { phone: { startsWith: "0555" } }] },
    })
  ).count;

  const couponsDeleted = (
    await testPrisma.coupon.deleteMany({ where: { code: { startsWith: E2E_PREFIX.toUpperCase() } } })
  ).count;

  const offersDeleted = (await testPrisma.offer.deleteMany({ where: { title: { startsWith: "E2E " } } })).count;

  const funnelsDeleted = (
    await testPrisma.funnel.deleteMany({ where: { slug: { startsWith: `${E2E_PREFIX}-` } } })
  ).count;

  // المنتجات والفئات آخِرًا (بعد حذف كل ما قد يُشير إليها بمفتاح أجنبي: أصناف الطلبات،
  // العروض، الفانلات)
  const productsDeleted = (
    await testPrisma.product.deleteMany({ where: { slug: { startsWith: `${E2E_PREFIX}-` } } })
  ).count;
  const categoriesDeleted = (
    await testPrisma.category.deleteMany({ where: { slug: { startsWith: `${E2E_PREFIX}-` } } })
  ).count;

  return {
    orders: ordersDeleted,
    orderItems: orderItemsDeleted,
    leads: leadsDeleted,
    products: productsDeleted,
    categories: categoriesDeleted,
    coupons: couponsDeleted,
    offers: offersDeleted,
    funnels: funnelsDeleted,
  };
}
