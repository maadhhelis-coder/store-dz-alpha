import { after } from "next/server";
import { prisma } from "@/server/db/prisma";
import * as ordersRepository from "@/server/repositories/ordersRepository";
import { findWilayaByCode } from "@/server/repositories/wilayasRepository";
import { fireWebhookEvent } from "@/server/services/webhooksService";
import { sendMetaCapiPurchase, sendMetaCapiOrderConfirmed, sendMetaCapiOrderDelivered } from "@/server/services/metaCapiService";
import { sendTikTokCompletePayment, sendTikTokOrderConfirmed, sendTikTokOrderDelivered } from "@/server/services/tiktokEventsApiService";
import { assertCouponUsable, computeCouponDiscountDzd, InvalidCouponError } from "@/lib/validation/couponRules";
import type { OrderCreateInput } from "@/lib/validation/orderSchema";
import { Prisma } from "@prisma/client";
import type { OrderStatus } from "@prisma/client";

export { InvalidCouponError };

export class ProductUnavailableError extends Error {
  constructor() {
    super("هذا المنتج غير متوفر حاليًا");
    this.name = "ProductUnavailableError";
  }
}

export class InsufficientStockError extends Error {
  constructor() {
    super("الكمية المطلوبة غير متوفرة بالمخزون");
    this.name = "InsufficientStockError";
  }
}

export class WilayaNotFoundError extends Error {
  constructor() {
    super("الولاية غير صحيحة");
    this.name = "WilayaNotFoundError";
  }
}

export class DeliveryOptionUnavailableError extends Error {
  constructor() {
    super("التوصيل للمكتب غير متوفر لهذه الولاية");
    this.name = "DeliveryOptionUnavailableError";
  }
}

export class OrderNotFoundError extends Error {
  constructor() {
    super("الطلب غير موجود");
    this.name = "OrderNotFoundError";
  }
}

export type CreateOrderMeta = {
  ipAddress?: string;
  userAgent?: string;
  deviceFingerprint?: string;
};

export async function createOrder(input: OrderCreateInput, meta: CreateOrderMeta) {
  const wilaya = await findWilayaByCode(input.wilayaCode);
  if (!wilaya || !wilaya.isActive) throw new WilayaNotFoundError();

  const deliveryPriceDzd =
    input.deliveryOption === "office" ? wilaya.officePriceDzd : wilaya.homePriceDzd;
  if (deliveryPriceDzd === null) throw new DeliveryOptionUnavailableError();

  try {
    return await createOrderTransaction(input, meta, deliveryPriceDzd, wilaya);
  } catch (error) {
    // مُتغيّر (variant) يُحذَف ويُعاد إنشاؤه بـUUID جديد كليًا عند كل تعديل منتج يمسّ
    // المتغيّرات (راجع productsService.updateProduct) — لو زبون فتح صفحة المنتج قبل هذا
    // التعديل مباشرة ثم أرسل الطلب بعده، الفحص أعلاه (variant موجود؟) كان قد نجح لحظة
    // القراءة داخل نفس المعاملة، لكن السباق النادر (تعديل يلتزم committed بين القراءة
    // والإدراج تحت READ COMMITTED) يجعل الإدراج الفعلي يخالف قيد المفتاح الأجنبي (P2003)
    // بدل رمي ProductUnavailableError الواضحة. نُعيد تفسيره لنفس الخطأ التجاري المفهوم
    // بدل خطأ 500 عام لا يشرح للزبون أن المتغيّر لم يعد متاحًا.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      throw new ProductUnavailableError();
    }
    throw error;
  }
}

async function createOrderTransaction(
  input: OrderCreateInput,
  meta: CreateOrderMeta,
  deliveryPriceDzd: number,
  wilaya: NonNullable<Awaited<ReturnType<typeof findWilayaByCode>>>,
) {
  return prisma.$transaction(async (tx) => {
    const product = await tx.product.findUnique({
      where: { slug: input.productSlug },
      include: { variants: true },
    });

    if (!product || !product.isPublished) throw new ProductUnavailableError();

    const variant = input.variantId
      ? product.variants.find((v) => v.id === input.variantId)
      : undefined;
    if (input.variantId && !variant) throw new ProductUnavailableError();

    const availableStock = variant ? variant.inventoryCount : product.inventoryCount;
    if (availableStock < input.quantity) throw new InsufficientStockError();

    const unitPriceDzd = variant?.priceOverrideDzd || product.priceDzd;
    const baseLineTotalDzd = unitPriceDzd * input.quantity;

    const itemsToCreate: Prisma.OrderItemUncheckedCreateWithoutOrderInput[] = [
      {
        productId: product.id,
        productNameSnapshot: product.name,
        productSlugSnapshot: product.slug,
        variantId: variant?.id,
        variantLabelSnapshot: variant ? `${variant.name}: ${variant.value}` : undefined,
        unitPriceDzd,
        quantity: input.quantity,
        lineTotalDzd: baseLineTotalDzd,
      },
    ];

    // العرض الإضافي (upsell) اختياري تمامًا: أي عرض غير صالح (محذوف/معطّل/مخزون نافد)
    // يُتجاهل بصمت بدل ما يفشّل الطلب كامل — تجربة الزبون أهم من سطر إضافي.
    let offerProductForStock: { id: string; isVariant: false } | null = null;
    let offerLineTotalDzd = 0;

    if (input.offerId) {
      const offer = await tx.offer.findUnique({
        where: { id: input.offerId },
        include: { offerProduct: true },
      });

      if (
        offer &&
        offer.isActive &&
        offer.triggerProductId === product.id &&
        offer.offerProduct.isPublished &&
        offer.offerProduct.inventoryCount >= 1
      ) {
        offerLineTotalDzd = offer.offerPriceDzd;
        itemsToCreate.push({
          productId: offer.offerProduct.id,
          productNameSnapshot: offer.offerProduct.name,
          productSlugSnapshot: offer.offerProduct.slug,
          unitPriceDzd: offer.offerPriceDzd,
          quantity: 1,
          lineTotalDzd: offer.offerPriceDzd,
        });
        offerProductForStock = { id: offer.offerProduct.id, isVariant: false };
      }
    }

    const itemsSubtotalDzd = baseLineTotalDzd + offerLineTotalDzd;

    let discountDzd = 0;
    let appliedCouponId: string | null = null;
    let appliedCouponCode: string | null = null;
    let appliedCouponUsageLimit: number | null = null;

    if (input.couponCode) {
      const coupon = await tx.coupon.findUnique({ where: { code: input.couponCode.trim().toUpperCase() } });
      if (!coupon) throw new InvalidCouponError("كود الخصم غير صالح");
      assertCouponUsable(coupon, itemsSubtotalDzd);

      discountDzd = computeCouponDiscountDzd(coupon, itemsSubtotalDzd);
      appliedCouponId = coupon.id;
      appliedCouponCode = coupon.code;
      appliedCouponUsageLimit = coupon.usageLimit;
    }

    const totalDzd = Math.max(0, itemsSubtotalDzd + deliveryPriceDzd - discountDzd);

    const order = await tx.order.create({
      data: {
        orderNumber: "TEMP", // يُستبدل بالأسفل بعد ما نعرف orderSeq
        customerFirstName: input.firstName,
        customerLastName: input.lastName,
        phone: input.phone,
        wilayaCode: wilaya.code,
        wilayaName: wilaya.name,
        commune: input.commune,
        address: input.address,
        deliveryOption: input.deliveryOption,
        deliveryPriceDzd,
        itemsSubtotalDzd,
        totalDzd,
        couponCode: appliedCouponCode,
        discountDzd,
        // نحفظ offerId فقط لو العرض أُضيف فعليًا (offerProductForStock) — وليس لمجرد أن
        // العميل طلبه؛ العرض قد يُتجاهل بصمت أعلاه (محذوف/معطّل/نافد المخزون). حفظ
        // input.offerId بلا شرط كان سيجعل getBestOffers التحليلية تربط طلبات لم تتضمن
        // العرض فعليًا بإيراده، ويمنع شاشة تأكيد الطلب من معرفة الحقيقة الفعلية.
        offerId: offerProductForStock ? input.offerId : null,
        source: input.source ?? "website",
        platform: input.platform,
        creativeName: input.creativeName,
        visitorId: input.visitorId,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        deviceFingerprint: meta.deviceFingerprint,
        items: {
          create: itemsToCreate,
        },
      },
    });

    const orderNumber = `SD-${order.orderSeq.toString().padStart(6, "0")}`;
    const finalOrder = await tx.order.update({
      where: { id: order.id },
      data: { orderNumber },
      include: { items: true },
    });

    // خصم مشروط (WHERE inventoryCount >= الكمية) بدل تحديث أعمى — يمنع البيع الزائد
    // (Overselling) عند طلبين متزامنين على آخر القطع؛ كلاهما كان سيقرأ نفس الرصيد المتاح
    // قبل التزام أي منهما تحت READ COMMITTED، فيتجاوز فحص التحقق الأولي معًا بلا هذا الشرط.
    if (variant) {
      const decremented = await tx.productVariant.updateMany({
        where: { id: variant.id, inventoryCount: { gte: input.quantity } },
        data: { inventoryCount: { decrement: input.quantity } },
      });
      if (decremented.count === 0) throw new InsufficientStockError();
    } else {
      const decremented = await tx.product.updateMany({
        where: { id: product.id, inventoryCount: { gte: input.quantity } },
        data: { inventoryCount: { decrement: input.quantity } },
      });
      if (decremented.count === 0) throw new InsufficientStockError();
    }

    if (offerProductForStock) {
      // مخزون العرض الإضافي نفد بين لحظة الفحص وهذه اللحظة — العرض اختياري أصلًا (راجع
      // التعليق أعلاه)، فنتجاهل نتيجة العملية بصمت هنا أيضًا بدل فشل الطلب كامل بسببه.
      await tx.product.updateMany({
        where: { id: offerProductForStock.id, inventoryCount: { gte: 1 } },
        data: { inventoryCount: { decrement: 1 } },
      });
    }

    if (appliedCouponId) {
      // نفس منطق الحماية أعلاه: شرط usedCount < الحد على أمر التحديث نفسه (لا فحص منفصل ثم
      // كتابة عمياء) — يمنع تجاوز حد الاستخدام عند استخدام نفس الكوبون بالتزامن من طلبين.
      const couponUpdated = await tx.coupon.updateMany({
        where: {
          id: appliedCouponId,
          ...(appliedCouponUsageLimit !== null ? { usedCount: { lt: appliedCouponUsageLimit } } : {}),
        },
        data: { usedCount: { increment: 1 } },
      });
      if (couponUpdated.count === 0) throw new InvalidCouponError("تم استنفاد عدد استخدامات هذا الكود");
    }

    return finalOrder;
  }).then((finalOrder) => {
    fireWebhookEvent("order_created", {
      orderId: finalOrder.id,
      orderNumber: finalOrder.orderNumber,
      status: finalOrder.status,
      source: finalOrder.source,
      totalDzd: finalOrder.totalDzd,
      itemsSubtotalDzd: finalOrder.itemsSubtotalDzd,
      deliveryPriceDzd: finalOrder.deliveryPriceDzd,
      discountDzd: finalOrder.discountDzd,
      couponCode: finalOrder.couponCode,
      customerFirstName: finalOrder.customerFirstName,
      customerLastName: finalOrder.customerLastName,
      phone: finalOrder.phone,
      wilayaName: finalOrder.wilayaName,
      commune: finalOrder.commune,
      address: finalOrder.address,
      deliveryOption: finalOrder.deliveryOption,
      items: finalOrder.items.map((item) => ({
        productName: item.productNameSnapshot,
        productSlug: item.productSlugSnapshot,
        variantLabel: item.variantLabelSnapshot,
        quantity: item.quantity,
        unitPriceDzd: item.unitPriceDzd,
        lineTotalDzd: item.lineTotalDzd,
      })),
    });
    after(() =>
      sendMetaCapiPurchase({
        orderNumber: finalOrder.orderNumber,
        totalDzd: finalOrder.totalDzd,
        phone: finalOrder.phone,
        firstName: finalOrder.customerFirstName,
        lastName: finalOrder.customerLastName,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      }).catch((error) => console.error("meta capi purchase error", error)),
    );
    after(() =>
      sendTikTokCompletePayment({
        orderNumber: finalOrder.orderNumber,
        totalDzd: finalOrder.totalDzd,
        phone: finalOrder.phone,
      }).catch((error) => console.error("tiktok events api error", error)),
    );
    return finalOrder;
  });
}

export function listOrders(params: ordersRepository.ListOrdersParams) {
  return ordersRepository.listOrders(params);
}

export function listOrderIds(filter: ordersRepository.OrdersFilter) {
  return ordersRepository.listOrderIds(filter);
}

export async function getOrder(id: string) {
  const order = await ordersRepository.findOrderById(id);
  if (!order) throw new OrderNotFoundError();
  return order;
}

// حالات "الطلب لن يُنفَّذ نهائيًا" — المخزون المحجوز له وقت الإنشاء يجب أن يعود متاحًا،
// وإلا فكل طلب يُلغى/يُكتشف مكررًا/وهميًا يُنقِص المخزون الظاهر للأبد بلا أي بيع فعلي —
// مع نسب الإلغاء المعتادة فتجارة الدفع عند الاستلام هذا يُصغِّر المخزون المتاح تدريجيًا
// حتى يظهر المنتج "نافد" رغم توفره فعليًا.
const STOCK_RELEASING_STATUSES: OrderStatus[] = ["cancelled", "fake", "duplicate", "wrong_number"];

function isStockReleasingStatus(status: OrderStatus): boolean {
  return STOCK_RELEASING_STATUSES.includes(status);
}

// يُستدعى فقط عند عبور فعلي لحدود "محجوز/متاح" (وليس عند كل تغيير حالة) — يمنع استرجاعًا
// أو حجزًا مزدوجًا لو تنقّل الطلب بين حالتين من نفس الجهة (مثلاً cancelled → fake).
async function adjustStockForStatusTransition(
  tx: Prisma.TransactionClient,
  items: { productId: string | null; variantId: string | null; quantity: number }[],
  direction: "restore" | "reclaim",
) {
  for (const item of items) {
    if (direction === "restore") {
      // استرجاع: زيادة بسيطة بلا شرط — لا يمكن أن تُنتِج قيمة سالبة.
      if (item.variantId) {
        await tx.productVariant.update({
          where: { id: item.variantId },
          data: { inventoryCount: { increment: item.quantity } },
        }).catch(() => {}); // المتغيّر قد يكون حُذف لاحقًا (onDelete: SetNull) — نتجاهل بأمان.
      } else if (item.productId) {
        await tx.product.update({
          where: { id: item.productId },
          data: { inventoryCount: { increment: item.quantity } },
        }).catch(() => {});
      }
    } else {
      // استرداد (إعادة تفعيل طلب كان مُلغى): نفس نمط الحجز الذَّرِّي وقت الإنشاء —
      // WHERE inventoryCount >= الكمية يمنع سحب المخزون تحت الصفر لو نفد المخزون
      // فمكان آخر منذ الإلغاء.
      if (item.variantId) {
        const result = await tx.productVariant.updateMany({
          where: { id: item.variantId, inventoryCount: { gte: item.quantity } },
          data: { inventoryCount: { decrement: item.quantity } },
        });
        if (result.count === 0) throw new InsufficientStockError();
      } else if (item.productId) {
        const result = await tx.product.updateMany({
          where: { id: item.productId, inventoryCount: { gte: item.quantity } },
          data: { inventoryCount: { decrement: item.quantity } },
        });
        if (result.count === 0) throw new InsufficientStockError();
      }
    }
  }
}

const MAX_STATUS_UPDATE_ATTEMPTS = 3;

export async function updateOrderStatus(
  id: string,
  status: OrderStatus,
  notes?: string,
): Promise<NonNullable<Awaited<ReturnType<typeof ordersRepository.findOrderById>>>> {
  for (let attempt = 1; attempt <= MAX_STATUS_UPDATE_ATTEMPTS; attempt++) {
    const existing = await ordersRepository.findOrderById(id);
    if (!existing) throw new OrderNotFoundError();

    const wasReleasing = isStockReleasingStatus(existing.status);
    const willRelease = isStockReleasingStatus(status);

    if (wasReleasing === willRelease) {
      const updated = await ordersRepository.updateOrderStatus(id, status, notes);
      return finalizeStatusUpdate(existing, updated);
    }

    // نحمي التحويل بمقارنة-وتبديل (compare-and-swap) على الحالة نفسها: القراءة أعلاه
    // (existing.status) خارج أي معاملة، فطلبَين متزامنين لإلغاء نفس الطلب قد يقرآن
    // نفس الحالة القديمة معًا، فيُنفِّذ كلاهما استرجاع المخزون (زيادة بلا شرط) — مخزون
    // وهمي مضاعف يُباع لاحقًا فعليًا. updateMany بشرط status=existing.status داخل نفس
    // المعاملة يضمن أن طلبًا واحدًا فقط يفوز؛ الخاسر يُعاد تشغيله (retry) على الحالة
    // الفعلية الجديدة بدل تكرار تعديل المخزون.
    const updated = await prisma.$transaction(async (tx) => {
      const guarded = await tx.order.updateMany({
        where: { id, status: existing.status },
        data: {
          status,
          ...(notes !== undefined ? { notes } : {}),
          ...ordersRepository.confirmedAtUpdate(status),
          ...ordersRepository.callAttemptsUpdate(status),
        },
      });
      if (guarded.count === 0) return null;

      await adjustStockForStatusTransition(tx, existing.items, willRelease ? "restore" : "reclaim");
      return tx.order.findUniqueOrThrow({ where: { id }, include: { items: true, wilaya: true } });
    });

    if (updated) return finalizeStatusUpdate(existing, updated);
    // guarded.count === 0: حالة الطلب تغيّرت بين القراءة أعلاه وبدء المعاملة — نعيد
    // المحاولة على أحدث حالة فعلية بدل رمي خطأ للمستخدم بلا داعٍ. أي خطأ آخر (مثل
    // InsufficientStockError الحقيقي عند نفاد المخزون فعليًا) يخرج من الحلقة فورًا،
    // ماشي إعادة محاولة — هذا خطأ عمل حقيقي، ليس تسابقًا عابرًا يستحق retry.
  }
  throw new Error("تعذّر تحديث حالة الطلب بعد عدة محاولات متزامنة، حاول من جديد");
}

function finalizeStatusUpdate(
  existing: NonNullable<Awaited<ReturnType<typeof ordersRepository.findOrderById>>>,
  updated: NonNullable<Awaited<ReturnType<typeof ordersRepository.findOrderById>>>,
) {
  // لا نُطلق أي حدث (webhook أو CAPI/TikTok) إذا لم تتغيّر الحالة فعليًا (مثلاً تحديث
  // ملاحظات فقط، أو إعادة تطبيق نفس الحالة عبر تأكيد جماعي) — كان الـwebhook يُرسَل
  // بلا شرط، فيصل لأي تكامل خارجي حدث "تغيّرت الحالة" وهميًا رغم أنها لم تتغيّر.
  if (existing.status !== updated.status) {
    fireWebhookEvent("order_status_changed", {
      orderId: updated.id,
      orderNumber: updated.orderNumber,
      previousStatus: existing.status,
      status: updated.status,
    });

    const capiOrderContext = {
      orderNumber: updated.orderNumber,
      totalDzd: updated.totalDzd,
      phone: updated.phone,
      firstName: updated.customerFirstName,
      lastName: updated.customerLastName,
    };
    const tiktokOrderContext = {
      orderNumber: updated.orderNumber,
      totalDzd: updated.totalDzd,
      phone: updated.phone,
    };
    if (updated.status === "confirmed") {
      after(() => sendMetaCapiOrderConfirmed(capiOrderContext).catch((error) => console.error("meta capi confirmed error", error)));
      after(() => sendTikTokOrderConfirmed(tiktokOrderContext).catch((error) => console.error("tiktok confirmed error", error)));
    }
    if (updated.status === "delivered") {
      after(() => sendMetaCapiOrderDelivered(capiOrderContext).catch((error) => console.error("meta capi delivered error", error)));
      after(() => sendTikTokOrderDelivered(tiktokOrderContext).catch((error) => console.error("tiktok delivered error", error)));
    }
  }

  return updated;
}

// نعيد استعمال updateOrderStatus لكل معرّف بدل updateMany مباشر — updateMany كان يتجاوز
// إطلاق أحداث Meta CAPI/TikTok، وهي الأداة التي يستعملها مؤكِّد الطلبات لتسريع تأكيد
// عشرات الطلبات يوميًا؛ كل استخدام كان يقطع بيانات تحسين الحملات الإعلانية بصمت.
export async function bulkUpdateOrderStatus(ids: string[], status: OrderStatus) {
  const results = await Promise.all(
    ids.map((id) =>
      updateOrderStatus(id, status).catch((error) => {
        console.error("bulk status update failed for order", id, error);
        return null;
      }),
    ),
  );
  return { count: results.filter(Boolean).length };
}

export async function updateOrderFields(
  id: string,
  data: Parameters<typeof ordersRepository.updateOrderFields>[1],
) {
  const existing = await ordersRepository.findOrderById(id);
  if (!existing) throw new OrderNotFoundError();
  return ordersRepository.updateOrderFields(id, data);
}
