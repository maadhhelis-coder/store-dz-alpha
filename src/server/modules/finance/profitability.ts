import {
  isRevenueDisqualified,
  isShippedEligible,
  isRtoOrder,
  sumAdjustments,
  ratio,
  averageDzd,
  type AdjustmentSnapshot,
} from "@/server/modules/metrics/definitions";

// =====================================================================
// محرك الربحية (P6) — المصدر الوحيد لحساب الربح على أي بُعد
// =====================================================================
// دوال صرفة على لقطات غير قابلة للتغيير فقط (لا قراءة للمنتجات الحالية أبدًا):
//
// Net Profit = Net Sales + Delivery Revenue − COGS − Carrier Cost − RTO/Return Cost
//              − Packaging − Advertising − Other + Adjustments
//
// - Net Sales        = itemsSubtotalDzd − discountDzd  (لقطة الطلب)
// - Delivery Revenue = deliveryPriceDzd
// - COGS             = Σ unitCostDzd(لقطة) × quantity — null يُعدّ 0 ويُرفع عدّاد
// - الإيراد (وCOGS) يُعترف بهما عند deliveredAt فقط، ويسقطان كليًا عند الإرجاع بعد
//   التسليم (returnedAt) — نفس أساس metrics/definitions.ts.
// - Carrier Cost     = كلفة الشحنة الفعلية (provenance=actual) إن وُجدت، وإلا التقدير
//   الموثّق: deliveryPriceDzd (رسم التوصيل المحصَّل ≈ أجرة الناقل) بـprovenance=estimated.
//   بلا شحنة أصلًا (لم يصل الناقل) = 0 وprovenance=unavailable. لا اختراع كلفة.
// - RTO/Return Cost  = Σ (outbound + return shipping) لدورات الإرجاع غير المرفوضة
//   + كلفة البضاعة التي لم تُعَد للمخزون ((quantity − restocked) × unitCost).
// - Packaging/Other  = لقطتا الطلب — تُحتسبان لما وصل الناقل فعلًا (shipped-eligible).
// - Advertising      = تخصيص إنفاق الإعلان الإبداعي (largest remainder) على الطلبات
//   المعزوّة إليه بنسبة إيرادها المُسلَّم — راجع allocateCreativeSpend.
// - Adjustments      = Σ credit − Σ debit (سجلات غير قابلة للتغيير).
//
// كل الأموال أعداد صحيحة دج؛ لا float ولا تقريب صامت: التوزيعات بـlargest remainder
// بحساب BigInt، ومجموع الحصص يساوي الأصل دائمًا.

export const ALLOCATION_METHOD = "largest_remainder_v1" as const;

export type ProfitItemInput = {
  id: string;
  productId: string | null;
  productName: string;
  quantity: number;
  unitPriceDzd: number;
  unitCostDzd: number | null;
  lineTotalDzd: number;
};

export type ProfitShipmentInput = {
  provider: string;
  shippingCostDzd: number | null;
  shippingCostProvenance: "actual" | "estimated" | "unavailable";
};

export type ProfitReturnInput = {
  status: string;
  isExchange: boolean;
  reason: string;
  outboundShippingCostDzd: number | null;
  returnShippingCostDzd: number | null;
  items: { orderItemId: string; quantity: number; restockedQuantity: number }[];
};

export type ProfitOrderInput = {
  id: string;
  orderNumber: string;
  status: string;
  createdAt: Date;
  deliveredAt: Date | null;
  returnedAt: Date | null;
  itemsSubtotalDzd: number;
  discountDzd: number;
  deliveryPriceDzd: number;
  totalDzd: number;
  packagingCostDzd: number;
  otherCostDzd: number;
  wilayaCode: number;
  wilayaName: string;
  commune: string;
  platform: string | null;
  creativeName: string | null;
  utmCampaign: string | null;
  campaignId: string | null;
  adSetId: string | null;
  adId: string | null;
  landingPath: string | null;
  customerId: string | null;
  customerMatchSource: string | null;
  items: ProfitItemInput[];
  shipments: ProfitShipmentInput[];
  returns: ProfitReturnInput[];
  adjustments: AdjustmentSnapshot[];
};

export type CreativeSpendInput = { platform: string; creativeName: string; spendDzd: number };

export type CarrierCostProvenance = "actual" | "estimated" | "unavailable";
export type AdvertisingProvenance = "allocated" | "unavailable" | "none";

/** المكوّنات المالية المشتركة بين سطر الطلب وأي تجميع. */
export type ProfitComponents = {
  grossRevenueDzd: number;
  discountDzd: number;
  netSalesDzd: number;
  deliveryRevenueDzd: number;
  cogsDzd: number;
  carrierCostDzd: number;
  rtoReturnCostDzd: number;
  packagingCostDzd: number;
  advertisingDzd: number;
  otherCostDzd: number;
  adjustmentsDzd: number;
  netProfitDzd: number;
};

export type OrderProfitLine = ProfitComponents & {
  orderId: string;
  orderNumber: string;
  status: string;
  date: string;
  recognized: boolean;
  returnedAfterDelivery: boolean;
  shippedEligible: boolean;
  rto: boolean;
  unknownCostItems: number;
  carrierCostProvenance: CarrierCostProvenance;
  advertisingProvenance: AdvertisingProvenance;
  creativeKey: string | null;
  acquiredCustomer: boolean;
  dims: {
    customerId: string | null;
    campaign: string | null;
    adSet: string | null;
    ad: string | null;
    creative: string | null;
    landingPage: string | null;
    wilaya: string;
    commune: string;
    carrier: string | null;
  };
  items: OrderItemProfitLine[];
};

/** سطر بند طلب: الخصم وتكاليف مستوى الطلب موزَّعة على البنود بنسبة lineTotal
 * (largest remainder) فمجموع البنود = الطلب حرفيًا. */
export type OrderItemProfitLine = ProfitComponents & {
  orderItemId: string;
  productId: string | null;
  productName: string;
  quantity: number;
  unitPriceDzd: number;
  unitCostDzd: number | null;
};

export function netProfitOf(c: Omit<ProfitComponents, "netProfitDzd">): number {
  return (
    c.netSalesDzd +
    c.deliveryRevenueDzd -
    c.cogsDzd -
    c.carrierCostDzd -
    c.rtoReturnCostDzd -
    c.packagingCostDzd -
    c.advertisingDzd -
    c.otherCostDzd +
    c.adjustmentsDzd
  );
}

// ===================== Largest remainder =====================

/** توزيع total (عدد صحيح ≥ 0) على أوزان صحيحة ≥ 0 حتميًا: حصص أرضية ثم البواقي
 * الأكبر أولًا (كسر التعادل بالفهرس الأصغر). Σ الحصص = total دائمًا؛ أوزان كلها
 * صفر ⇒ حصص كلها صفر (لا توزيع بلا أساس). حساب BigInt — لا float. */
export function allocateLargestRemainder(total: number, weights: readonly number[]): number[] {
  if (!Number.isInteger(total) || total < 0) throw new Error("total must be a non-negative integer");
  const n = weights.length;
  const shares = new Array<number>(n).fill(0);
  if (n === 0 || total === 0) return shares;
  let sum = BigInt(0);
  for (const w of weights) {
    if (!Number.isInteger(w) || w < 0) throw new Error("weights must be non-negative integers");
    sum += BigInt(w);
  }
  if (sum === BigInt(0)) return shares;
  const T = BigInt(total);
  const remainders: { index: number; remainder: bigint }[] = [];
  let allocated = BigInt(0);
  for (let i = 0; i < n; i++) {
    const product = T * BigInt(weights[i]);
    const share = product / sum;
    shares[i] = Number(share);
    allocated += share;
    remainders.push({ index: i, remainder: product % sum });
  }
  let left = Number(T - allocated);
  remainders.sort((a, b) =>
    a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1,
  );
  for (let k = 0; k < remainders.length && left > 0; k++, left--) {
    shares[remainders[k].index] += 1;
  }
  return shares;
}

// ===================== تخصيص إنفاق الإعلانات =====================

export type CreativeAllocationResult = {
  method: typeof ALLOCATION_METHOD;
  /** حصة كل طلب معزوّ (مفتاح = orderId) */
  perOrder: Map<string, number>;
  /** إبداعات بإنفاق بلا أي إيراد مُسلَّم في الفترة — الإنفاق غير قابل للتخصيص (لا تخمين) */
  unallocatedSpendDzd: number;
  unallocatedCreatives: string[];
  /** الإنفاق المخصَّص فعلًا (= Σ الحصص) — لا يتجاوز الإنفاق المؤهَّل أبدًا */
  allocatedSpendDzd: number;
};

export function creativeKeyOf(platform: string | null, creativeName: string | null): string | null {
  if (!platform || !creativeName) return null;
  return `${platform}::${creativeName}`;
}

/** allocated_i = spend × delivered_revenue_i ÷ Σ delivered_revenue (largest remainder).
 * يُخصَّص لكل إبداع مرة واحدة على مجموعة الطلبات المعطاة — لا ازدواج. */
export function allocateCreativeSpend(
  orders: readonly { id: string; creativeKey: string | null; deliveredRevenueDzd: number }[],
  spends: readonly CreativeSpendInput[],
): CreativeAllocationResult {
  const byCreative = new Map<string, { id: string; revenue: number }[]>();
  for (const o of orders) {
    if (!o.creativeKey || o.deliveredRevenueDzd <= 0) continue;
    const list = byCreative.get(o.creativeKey) ?? [];
    list.push({ id: o.id, revenue: o.deliveredRevenueDzd });
    byCreative.set(o.creativeKey, list);
  }
  const perOrder = new Map<string, number>();
  let unallocated = 0;
  let allocated = 0;
  const unallocatedCreatives: string[] = [];
  const seen = new Set<string>();
  for (const spend of spends) {
    const key = creativeKeyOf(spend.platform, spend.creativeName);
    if (!key || seen.has(key)) continue; // نفس الإبداع مرتين = لا تخصيص مزدوج
    seen.add(key);
    const list = byCreative.get(key);
    if (!list || list.length === 0) {
      if (spend.spendDzd > 0) {
        unallocated += spend.spendDzd;
        unallocatedCreatives.push(key);
      }
      continue;
    }
    // ترتيب حتمي بالمعرّف قبل التوزيع — نفس المدخلات تعطي نفس الحصص دائمًا
    list.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const shares = allocateLargestRemainder(spend.spendDzd, list.map((o) => o.revenue));
    list.forEach((o, i) => {
      perOrder.set(o.id, shares[i]);
      allocated += shares[i];
    });
  }
  return {
    method: ALLOCATION_METHOD,
    perOrder,
    unallocatedSpendDzd: unallocated,
    unallocatedCreatives,
    allocatedSpendDzd: allocated,
  };
}

// ===================== سطر الطلب =====================

function dayOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function computeOrderProfitLines(
  orders: readonly ProfitOrderInput[],
  spends: readonly CreativeSpendInput[],
): { lines: OrderProfitLine[]; allocation: CreativeAllocationResult } {
  const eligible = orders.filter((o) => !isRevenueDisqualified(o.status));
  const spendable = eligible.map((o) => {
    const recognizedNet = o.deliveredAt !== null && o.returnedAt === null;
    return {
      id: o.id,
      creativeKey: creativeKeyOf(o.platform, o.creativeName),
      deliveredRevenueDzd: recognizedNet ? o.totalDzd : 0,
    };
  });
  const allocation = allocateCreativeSpend(spendable, spends);
  const lines = eligible.map((o) => computeOrderProfitLine(o, allocation.perOrder.get(o.id)));
  return { lines, allocation };
}

function computeOrderProfitLine(o: ProfitOrderInput, allocatedAd: number | undefined): OrderProfitLine {
  const recognized = o.deliveredAt !== null;
  const returnedAfterDelivery = recognized && o.returnedAt !== null;
  const revenueCounts = recognized && !returnedAfterDelivery;
  const shippedEligible = isShippedEligible(o.status);
  const rto = isRtoOrder(o);

  // COGS من اللقطات
  let cogs = 0;
  let unknownCostItems = 0;
  for (const it of o.items) {
    if (it.unitCostDzd === null) unknownCostItems += it.quantity;
    else cogs += it.unitCostDzd * it.quantity;
  }

  // كلفة الناقل
  let carrierCost = 0;
  let carrierProvenance: CarrierCostProvenance = "unavailable";
  if (shippedEligible) {
    const actual = o.shipments.filter(
      (s) => s.shippingCostProvenance === "actual" && s.shippingCostDzd !== null,
    );
    if (actual.length > 0) {
      carrierCost = actual.reduce((sum, s) => sum + (s.shippingCostDzd ?? 0), 0);
      carrierProvenance = "actual";
    } else {
      carrierCost = o.deliveryPriceDzd;
      carrierProvenance = "estimated";
    }
  }

  // كلفة الإرجاع/RTO: شحن الدورات + بضاعة لم تُعَد للمخزون
  let rtoReturnCost = 0;
  const unitCostById = new Map(o.items.map((it) => [it.id, it.unitCostDzd]));
  for (const r of o.returns) {
    if (r.status === "rejected") continue;
    rtoReturnCost += (r.outboundShippingCostDzd ?? 0) + (r.returnShippingCostDzd ?? 0);
    for (const ri of r.items) {
      const unitCost = unitCostById.get(ri.orderItemId) ?? null;
      if (unitCost === null) continue;
      rtoReturnCost += Math.max(0, ri.quantity - ri.restockedQuantity) * unitCost;
    }
  }

  const creativeKey = creativeKeyOf(o.platform, o.creativeName);
  let advertising = 0;
  let advertisingProvenance: AdvertisingProvenance = "none";
  if (creativeKey) {
    if (allocatedAd !== undefined) {
      advertising = allocatedAd;
      advertisingProvenance = "allocated";
    } else if (revenueCounts) {
      // طلب معزوّ ومعترف به لكن لا إنفاق مسجَّل لإبداعه — العزو غير متاح، لا تخمين
      advertisingProvenance = "unavailable";
    }
  }

  const base = {
    grossRevenueDzd: revenueCounts ? o.itemsSubtotalDzd : 0,
    discountDzd: revenueCounts ? o.discountDzd : 0,
    netSalesDzd: revenueCounts ? o.itemsSubtotalDzd - o.discountDzd : 0,
    deliveryRevenueDzd: revenueCounts ? o.deliveryPriceDzd : 0,
    cogsDzd: revenueCounts ? cogs : 0,
    carrierCostDzd: carrierCost,
    rtoReturnCostDzd: rtoReturnCost,
    packagingCostDzd: shippedEligible ? o.packagingCostDzd : 0,
    advertisingDzd: advertising,
    otherCostDzd: shippedEligible ? o.otherCostDzd : 0,
    adjustmentsDzd: sumAdjustments(o.adjustments),
  };
  const components: ProfitComponents = { ...base, netProfitDzd: netProfitOf(base) };

  return {
    ...components,
    orderId: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    date: dayOf(o.createdAt),
    recognized,
    returnedAfterDelivery,
    shippedEligible,
    rto,
    unknownCostItems: revenueCounts ? unknownCostItems : 0,
    carrierCostProvenance: carrierProvenance,
    advertisingProvenance,
    creativeKey,
    acquiredCustomer:
      revenueCounts && o.customerId !== null && o.customerMatchSource === "new_customer",
    dims: {
      customerId: o.customerId,
      campaign: o.utmCampaign ?? o.campaignId,
      adSet: o.adSetId,
      ad: o.adId,
      creative: creativeKey,
      landingPage: o.landingPath,
      wilaya: `${o.wilayaCode}:${o.wilayaName}`,
      commune: `${o.wilayaCode}:${o.commune}`,
      carrier: o.shipments[0]?.provider ?? null,
    },
    items: splitToItems(components, o.items, revenueCounts),
  };
}

const ITEM_ALLOCATED_KEYS = [
  "discountDzd",
  "deliveryRevenueDzd",
  "carrierCostDzd",
  "rtoReturnCostDzd",
  "packagingCostDzd",
  "advertisingDzd",
  "otherCostDzd",
  "adjustmentsDzd",
] as const;

/** توزيع مكوّنات مستوى الطلب على البنود بنسبة lineTotal — مجموع البنود = الطلب. */
function splitToItems(
  order: ProfitComponents,
  items: readonly ProfitItemInput[],
  revenueCounts: boolean,
): OrderItemProfitLine[] {
  const weights = items.map((it) => Math.max(0, it.lineTotalDzd));
  const allocated = {} as Record<(typeof ITEM_ALLOCATED_KEYS)[number], number[]>;
  for (const key of ITEM_ALLOCATED_KEYS) {
    const value = order[key];
    // التعديلات قد تكون سالبة: نوزّع القيمة المطلقة ثم نعيد الإشارة
    const shares = allocateLargestRemainder(Math.abs(value), weights);
    allocated[key] = value < 0 ? shares.map((s) => -s) : shares;
  }
  return items.map((it, i) => {
    const gross = revenueCounts ? it.lineTotalDzd : 0;
    const cogs = revenueCounts && it.unitCostDzd !== null ? it.unitCostDzd * it.quantity : 0;
    const base = {
      grossRevenueDzd: gross,
      discountDzd: allocated.discountDzd[i],
      netSalesDzd: gross - allocated.discountDzd[i],
      deliveryRevenueDzd: allocated.deliveryRevenueDzd[i],
      cogsDzd: cogs,
      carrierCostDzd: allocated.carrierCostDzd[i],
      rtoReturnCostDzd: allocated.rtoReturnCostDzd[i],
      packagingCostDzd: allocated.packagingCostDzd[i],
      advertisingDzd: allocated.advertisingDzd[i],
      otherCostDzd: allocated.otherCostDzd[i],
      adjustmentsDzd: allocated.adjustmentsDzd[i],
    };
    return {
      ...base,
      netProfitDzd: netProfitOf(base),
      orderItemId: it.id,
      productId: it.productId,
      productName: it.productName,
      quantity: it.quantity,
      unitPriceDzd: it.unitPriceDzd,
      unitCostDzd: it.unitCostDzd,
    };
  });
}

// ===================== التجميع على الأبعاد =====================

export const PROFIT_DIMENSIONS = [
  "order",
  "orderItem",
  "product",
  "customer",
  "campaign",
  "adSet",
  "ad",
  "creative",
  "landingPage",
  "wilaya",
  "commune",
  "carrier",
  "date",
] as const;

export type ProfitDimension = (typeof PROFIT_DIMENSIONS)[number];

export type ProfitAggregate = ProfitComponents & {
  key: string;
  label: string;
  orders: number;
  recognizedOrders: number;
  unknownCostItems: number;
  estimatedCarrierOrders: number;
  adUnavailableOrders: number;
};

function emptyAggregate(key: string, label: string): ProfitAggregate {
  return {
    key,
    label,
    orders: 0,
    recognizedOrders: 0,
    unknownCostItems: 0,
    estimatedCarrierOrders: 0,
    adUnavailableOrders: 0,
    grossRevenueDzd: 0,
    discountDzd: 0,
    netSalesDzd: 0,
    deliveryRevenueDzd: 0,
    cogsDzd: 0,
    carrierCostDzd: 0,
    rtoReturnCostDzd: 0,
    packagingCostDzd: 0,
    advertisingDzd: 0,
    otherCostDzd: 0,
    adjustmentsDzd: 0,
    netProfitDzd: 0,
  };
}

function addComponents(target: ProfitAggregate, c: ProfitComponents): void {
  target.grossRevenueDzd += c.grossRevenueDzd;
  target.discountDzd += c.discountDzd;
  target.netSalesDzd += c.netSalesDzd;
  target.deliveryRevenueDzd += c.deliveryRevenueDzd;
  target.cogsDzd += c.cogsDzd;
  target.carrierCostDzd += c.carrierCostDzd;
  target.rtoReturnCostDzd += c.rtoReturnCostDzd;
  target.packagingCostDzd += c.packagingCostDzd;
  target.advertisingDzd += c.advertisingDzd;
  target.otherCostDzd += c.otherCostDzd;
  target.adjustmentsDzd += c.adjustmentsDzd;
  target.netProfitDzd += c.netProfitDzd;
}

const UNATTRIBUTED = "—";

/** مفتاح+تسمية البُعد لسطر طلب؛ null للأبعاد على مستوى البند. */
function dimensionKey(
  line: OrderProfitLine,
  dimension: ProfitDimension,
): { key: string; label: string } | null {
  const d = line.dims;
  switch (dimension) {
    case "order":
      return { key: line.orderId, label: line.orderNumber };
    case "customer":
      return { key: d.customerId ?? UNATTRIBUTED, label: d.customerId ?? "بلا عميل" };
    case "campaign":
      return { key: d.campaign ?? UNATTRIBUTED, label: d.campaign ?? "بلا حملة" };
    case "adSet":
      return { key: d.adSet ?? UNATTRIBUTED, label: d.adSet ?? "بلا مجموعة إعلانية" };
    case "ad":
      return { key: d.ad ?? UNATTRIBUTED, label: d.ad ?? "بلا إعلان" };
    case "creative":
      return { key: d.creative ?? UNATTRIBUTED, label: d.creative ?? "بلا إبداع" };
    case "landingPage":
      return { key: d.landingPage ?? UNATTRIBUTED, label: d.landingPage ?? "بلا صفحة هبوط" };
    case "wilaya":
      return { key: d.wilaya, label: d.wilaya.split(":").slice(1).join(":") };
    case "commune":
      return { key: d.commune, label: d.commune.split(":").slice(1).join(":") };
    case "carrier":
      return { key: d.carrier ?? UNATTRIBUTED, label: d.carrier ?? "بلا ناقل" };
    case "date":
      return { key: line.date, label: line.date };
    case "orderItem":
    case "product":
      return null;
  }
}

/** تجميع حتمي على بُعد — الترتيب بصافي الربح تنازليًا ثم المفتاح. */
export function aggregateProfit(
  lines: readonly OrderProfitLine[],
  dimension: ProfitDimension,
): ProfitAggregate[] {
  const buckets = new Map<string, ProfitAggregate>();
  const bucket = (key: string, label: string) => {
    let agg = buckets.get(key);
    if (!agg) {
      agg = emptyAggregate(key, label);
      buckets.set(key, agg);
    }
    return agg;
  };
  for (const line of lines) {
    if (dimension === "orderItem" || dimension === "product") {
      const counted = new Set<string>();
      for (const it of line.items) {
        const key =
          dimension === "orderItem" ? it.orderItemId : (it.productId ?? `name:${it.productName}`);
        const agg = bucket(
          key,
          dimension === "orderItem" ? `${line.orderNumber} · ${it.productName}` : it.productName,
        );
        addComponents(agg, it);
        if (!counted.has(key)) {
          counted.add(key);
          agg.orders += 1;
          if (line.recognized) agg.recognizedOrders += 1;
          if (line.carrierCostProvenance === "estimated") agg.estimatedCarrierOrders += 1;
          if (line.advertisingProvenance === "unavailable") agg.adUnavailableOrders += 1;
        }
        if (it.unitCostDzd === null && line.recognized && !line.returnedAfterDelivery) {
          agg.unknownCostItems += it.quantity;
        }
      }
      continue;
    }
    const k = dimensionKey(line, dimension);
    if (!k) continue;
    const agg = bucket(k.key, k.label);
    addComponents(agg, line);
    agg.orders += 1;
    if (line.recognized) agg.recognizedOrders += 1;
    agg.unknownCostItems += line.unknownCostItems;
    if (line.carrierCostProvenance === "estimated") agg.estimatedCarrierOrders += 1;
    if (line.advertisingProvenance === "unavailable") agg.adUnavailableOrders += 1;
  }
  return [...buckets.values()].sort((a, b) =>
    a.netProfitDzd === b.netProfitDzd
      ? a.key < b.key
        ? -1
        : a.key > b.key
          ? 1
          : 0
      : b.netProfitDzd - a.netProfitDzd,
  );
}

// ===================== الملخص =====================

export type ProfitSummary = ProfitComponents & {
  orders: number;
  recognizedOrders: number;
  unknownCostItems: number;
  estimatedCarrierOrders: number;
  actualCarrierOrders: number;
  adUnavailableOrders: number;
  attributedOrders: number;
  attributedRevenueDzd: number;
  attributedNetProfitDzd: number;
  attributedSpendDzd: number;
  unallocatedSpendDzd: number;
  acquiredCustomers: number;
  acquisitionSpendDzd: number;
  aovDzd: number | null;
  roas: number | null;
  profitRoas: number | null;
  cacDzd: number | null;
  allocationMethod: typeof ALLOCATION_METHOD;
};

export function summarizeProfit(
  lines: readonly OrderProfitLine[],
  allocation: CreativeAllocationResult,
): ProfitSummary {
  const total = emptyAggregate("total", "الإجمالي");
  let actualCarrier = 0;
  let attributedOrders = 0;
  let attributedRevenue = 0;
  let attributedProfit = 0;
  let acquisitionSpend = 0;
  let recognizedRevenue = 0;
  let recognizedNonReturned = 0;
  const acquired = new Set<string>();
  for (const line of lines) {
    addComponents(total, line);
    total.orders += 1;
    if (line.recognized) total.recognizedOrders += 1;
    total.unknownCostItems += line.unknownCostItems;
    if (line.carrierCostProvenance === "estimated") total.estimatedCarrierOrders += 1;
    if (line.carrierCostProvenance === "actual") actualCarrier += 1;
    if (line.advertisingProvenance === "unavailable") total.adUnavailableOrders += 1;
    if (line.recognized && !line.returnedAfterDelivery) {
      recognizedNonReturned += 1;
      recognizedRevenue += line.netSalesDzd + line.deliveryRevenueDzd;
    }
    if (line.advertisingProvenance === "allocated") {
      attributedOrders += 1;
      attributedRevenue += line.netSalesDzd + line.deliveryRevenueDzd;
      attributedProfit += line.netProfitDzd;
      if (line.acquiredCustomer && line.dims.customerId) {
        acquired.add(line.dims.customerId);
        acquisitionSpend += line.advertisingDzd;
      }
    }
  }
  return {
    ...total,
    actualCarrierOrders: actualCarrier,
    attributedOrders,
    attributedRevenueDzd: attributedRevenue,
    attributedNetProfitDzd: attributedProfit,
    attributedSpendDzd: allocation.allocatedSpendDzd,
    unallocatedSpendDzd: allocation.unallocatedSpendDzd,
    acquiredCustomers: acquired.size,
    acquisitionSpendDzd: acquisitionSpend,
    aovDzd: averageDzd(recognizedRevenue, recognizedNonReturned),
    roas: ratio(attributedRevenue, allocation.allocatedSpendDzd),
    profitRoas: ratio(attributedProfit, allocation.allocatedSpendDzd),
    cacDzd: averageDzd(acquisitionSpend, acquired.size),
    allocationMethod: ALLOCATION_METHOD,
  };
}
