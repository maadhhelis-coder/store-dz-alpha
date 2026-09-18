import { prisma } from "@/server/db/prisma";
import type { Prisma } from "@prisma/client";
import {
  aggregateProfit,
  computeOrderProfitLines,
  summarizeProfit,
  PROFIT_DIMENSIONS,
  type CreativeSpendInput,
  type OrderProfitLine,
  type ProfitAggregate,
  type ProfitDimension,
  type ProfitOrderInput,
  type ProfitSummary,
} from "@/server/modules/finance/profitability";
import {
  computeOperationalRates,
  type OperationalRates,
} from "@/server/modules/metrics/definitions";

// طبقة الجلب للربحية — نقل فقط، لا حساب هنا (الحساب في profitability.ts حصرًا).
// استثناء isTest صريح على مستوى الاستعلام (لا فلترة واجهة). الطلبات تُختار
// بـcreatedAt داخل الفترة (فترة العمل الحتمية)، والاعتراف بالإيراد يبقى بدليل
// deliveredAt كما في التعريفات — طلب أُنشئ في الفترة وسُلِّم بعدها يظهر معترفًا به
// إن كان مُسلَّمًا وقت الاستعلام.
//
// حدود معروفة (موثّقة، لا تُخفى): إنفاق الإعلانات في ad_spend_entries نافذة متدحرجة
// (آخر 30 يومًا للمزامنة التلقائية) وليس مؤرَّخًا يوميًا — التخصيص يوزّع الإنفاق
// الحالي لكل إبداع على طلبات الفترة المختارة المعزوّة إليه؛ فترة أطول من 30 يومًا
// تخصّص إنفاق 30 يومًا على طلبات أكثر. يُعرض ذلك في الواجهة تحت ROAS.

export type ProfitabilityWindow = { from: Date; to: Date };

export type ProfitabilityReport = {
  window: { from: string; to: string };
  summary: ProfitSummary;
  rates: OperationalRates;
  dimension: ProfitDimension;
  rows: ProfitAggregate[];
  unallocatedCreatives: string[];
};

export const MAX_DIMENSION_ROWS = 500;

export function isProfitDimension(value: string): value is ProfitDimension {
  return (PROFIT_DIMENSIONS as readonly string[]).includes(value);
}

const orderSelect = {
  id: true,
  orderNumber: true,
  status: true,
  createdAt: true,
  deliveredAt: true,
  returnedAt: true,
  itemsSubtotalDzd: true,
  discountDzd: true,
  deliveryPriceDzd: true,
  totalDzd: true,
  packagingCostDzd: true,
  otherCostDzd: true,
  wilayaCode: true,
  wilayaName: true,
  commune: true,
  platform: true,
  creativeName: true,
  utmCampaign: true,
  campaignId: true,
  adSetId: true,
  adId: true,
  landingPath: true,
  customerId: true,
  customerMatchSource: true,
  items: {
    select: {
      id: true,
      productId: true,
      productNameSnapshot: true,
      quantity: true,
      unitPriceDzd: true,
      unitCostDzd: true,
      lineTotalDzd: true,
    },
  },
  shipments: {
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { provider: true, shippingCostDzd: true, shippingCostProvenance: true },
  },
  returns: {
    select: {
      status: true,
      isExchange: true,
      reason: true,
      outboundShippingCostDzd: true,
      returnShippingCostDzd: true,
      items: { select: { orderItemId: true, quantity: true, restockedQuantity: true } },
    },
  },
  financialAdjustments: { select: { amountDzd: true, direction: true } },
} satisfies Prisma.OrderSelect;

type OrderRow = Awaited<ReturnType<typeof fetchOrders>>[number];

async function fetchOrders(where: { createdAt?: { gte: Date; lte: Date }; id?: string }) {
  return prisma.order.findMany({
    where: { isTest: false, ...where },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: orderSelect,
  });
}

function toInput(o: OrderRow): ProfitOrderInput {
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    createdAt: o.createdAt,
    deliveredAt: o.deliveredAt,
    returnedAt: o.returnedAt,
    itemsSubtotalDzd: o.itemsSubtotalDzd,
    discountDzd: o.discountDzd,
    deliveryPriceDzd: o.deliveryPriceDzd,
    totalDzd: o.totalDzd,
    packagingCostDzd: o.packagingCostDzd,
    otherCostDzd: o.otherCostDzd,
    wilayaCode: o.wilayaCode,
    wilayaName: o.wilayaName,
    commune: o.commune,
    platform: o.platform,
    creativeName: o.creativeName,
    utmCampaign: o.utmCampaign,
    campaignId: o.campaignId,
    adSetId: o.adSetId,
    adId: o.adId,
    landingPath: o.landingPath,
    customerId: o.customerId,
    customerMatchSource: o.customerMatchSource,
    items: o.items.map((it) => ({
      id: it.id,
      productId: it.productId,
      productName: it.productNameSnapshot,
      quantity: it.quantity,
      unitPriceDzd: it.unitPriceDzd,
      unitCostDzd: it.unitCostDzd,
      lineTotalDzd: it.lineTotalDzd,
    })),
    shipments: o.shipments,
    returns: o.returns,
    adjustments: o.financialAdjustments,
  };
}

async function fetchCreativeSpend(): Promise<CreativeSpendInput[]> {
  const rows = await prisma.adSpendEntry.findMany({
    where: { isActive: true, spendDzd: { gt: 0 } },
    select: { platform: true, creativeName: true, spendDzd: true },
  });
  return rows.map((r) => ({ platform: r.platform, creativeName: r.creativeName, spendDzd: r.spendDzd }));
}

/** تقرير الربحية لفترة على بُعد — كل الطلبات الإنتاجية داخل الفترة. */
export async function getProfitabilityReport(
  window: ProfitabilityWindow,
  dimension: ProfitDimension,
): Promise<ProfitabilityReport> {
  const [orders, spends] = await Promise.all([
    fetchOrders({ createdAt: { gte: window.from, lte: window.to } }),
    fetchCreativeSpend(),
  ]);
  const inputs = orders.map(toInput);
  const { lines, allocation } = computeOrderProfitLines(inputs, spends);
  const rates = computeOperationalRates({
    orders: orders.map((o) => ({ status: o.status, deliveredAt: o.deliveredAt })),
    returns: orders.flatMap((o) =>
      o.returns.map((r) => ({ reason: r.reason, status: r.status, isExchange: r.isExchange })),
    ),
  });
  return {
    window: { from: window.from.toISOString(), to: window.to.toISOString() },
    summary: summarizeProfit(lines, allocation),
    rates,
    dimension,
    rows: aggregateProfit(lines, dimension).slice(0, MAX_DIMENSION_ROWS),
    unallocatedCreatives: allocation.unallocatedCreatives,
  };
}

/** سطر ربحية طلب واحد (لصفحة الطلب) — null لطلب اختبار أو غير موجود. */
export async function getOrderProfitLine(orderId: string): Promise<OrderProfitLine | null> {
  const [orders, spends] = await Promise.all([fetchOrders({ id: orderId }), fetchCreativeSpend()]);
  if (orders.length === 0) return null;
  const { lines } = computeOrderProfitLines(orders.map(toInput), spends);
  return lines[0] ?? null;
}
