import { prisma } from "@/server/db/prisma";
import {
  computeCustomerMetrics,
  type CustomerMetrics,
  type OrderFinancialSnapshot,
} from "@/server/modules/metrics/definitions";

// جلب لقطات الطلب المالية للعميل — طبقة النقل فقط: لا حساب مالي هنا إطلاقًا
// (الحساب الحتمي في metrics/definitions.ts حصرًا). استثناء isTest صريح دفاعيًا
// (قيد القاعدة يمنع ربطها بعميل أصلًا، والفلتر يثبت العزم على مستوى الاستعلام).
// جلب واحد بلا N+1: الطلبات + بنودها في استعلامين فقط.

export async function getCustomerMetrics(customerId: string): Promise<CustomerMetrics> {
  const [orders, returnCosts] = await Promise.all([
    prisma.order.findMany({
      where: { customerId, isTest: false },
      select: {
        id: true,
        status: true,
        totalDzd: true,
        deliveryPriceDzd: true,
        packagingCostDzd: true,
        otherCostDzd: true,
        deliveredAt: true,
        returnedAt: true,
        codCollectedAt: true,
        codCollectedAmountDzd: true,
        items: { select: { quantity: true, unitCostDzd: true } },
      },
    }),
    prisma.returnRecord.findMany({
      where: { order: { customerId, isTest: false } },
      select: { returnShippingCostDzd: true },
    }),
  ]);

  const snapshots: OrderFinancialSnapshot[] = orders.map((order) => {
    let itemsCost = 0;
    let unknownCostItems = 0;
    for (const item of order.items) {
      if (item.unitCostDzd === null) {
        unknownCostItems += item.quantity;
      } else {
        itemsCost += item.quantity * item.unitCostDzd;
      }
    }
    return {
      id: order.id,
      status: order.status,
      totalDzd: order.totalDzd,
      deliveryPriceDzd: order.deliveryPriceDzd,
      packagingCostDzd: order.packagingCostDzd,
      otherCostDzd: order.otherCostDzd,
      deliveredAt: order.deliveredAt,
      returnedAt: order.returnedAt,
      codCollectedAt: order.codCollectedAt,
      codCollectedAmountDzd: order.codCollectedAmountDzd,
      itemsCostDzd: itemsCost,
      unknownCostItems,
    };
  });

  return computeCustomerMetrics({ orders: snapshots, returnCosts });
}
