import { after } from "next/server";
import { prisma } from "@/server/db/prisma";
import { revalidateStorefrontProducts } from "@/server/services/productsService";
import * as ordersRepository from "@/server/repositories/ordersRepository";
import { findWilayaByCode } from "@/server/repositories/wilayasRepository";
import { fireWebhookEvent } from "@/server/services/webhooksService";
import { sendMetaCapiPurchase } from "@/server/services/metaCapiService";
import { sendTikTokCompletePayment } from "@/server/services/tiktokEventsApiService";
import { assertCouponUsable, computeCouponDiscountDzd, InvalidCouponError } from "@/lib/validation/couponRules";
import type { OrderCreateInput } from "@/lib/validation/orderSchema";
import { matchOrCreateCustomerInTx } from "@/server/modules/customers/identityService";
import { createOutboxEvent, transitionOrderStatus } from "@/server/modules/orders/statusService";
import { Prisma } from "@prisma/client";
import type { OrderStatus } from "@prisma/client";
import { notifyOwner } from "@/lib/ownerNotify";
import { raiseSystemAlertOnce } from "@/server/modules/alerts/alertsService";
import { LOW_STOCK_THRESHOLD } from "@/lib/stock";
import { formatPrice } from "@/lib/format";

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
        // لقطة تكلفة الوحدة وقت الطلب — راجع Product.costDzd/OrderItem.unitCostDzd فـschema.
        // undefined صراحةً (لا 0) لو المنتج بلا تكلفة مضبوطة، حتى لا يُحسَب ربح كامل السعر
        // خطأً على منتج تكلفته غير معروفة فعليًا.
        unitCostDzd: product.costDzd ?? undefined,
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
          unitCostDzd: offer.offerProduct.costDzd ?? undefined,
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

    // هوية العميل — مطابقة حتمية بالهاتف داخل نفس المعاملة (طلبات الإنتاج فقط).
    // طلبات isTest لا تنشئ عملاء ولا تُربط (قيد قاعدة بيانات + قاعدة مقفلة).
    // الطلب الحالي من الواجهة العامة = إنتاجي (isTest false)؛ وسم الاختبار
    // يُدار حصرًا عبر عملية متميزة موثّقة (ليس عبر هذا المسار).
    const customerMatch = await matchOrCreateCustomerInTx(tx, {
      phone: input.phone,
      firstName: input.firstName,
      lastName: input.lastName,
      wilayaCode: wilaya.code,
      commune: input.commune,
      address: input.address,
    });

    const order = await tx.order.create({
      data: {
        orderNumber: "TEMP", // يُستبدل بالأسفل بعد ما نعرف orderSeq
        customerFirstName: input.firstName,
        customerLastName: input.lastName,
        phone: input.phone,
        phoneNormalized: ordersRepository.normalizePhone(input.phone),
        customerId: customerMatch.customerId,
        customerMatchSource: customerMatch.matchSource,
        matchedPhoneId: customerMatch.matchedPhoneId,
        packagingCostDzd: 0, // الافتراضي التشغيلي — يُعدَّل من الإعدادات في P6
        otherCostDzd: 0,
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

    // outbox معاملاتي: الحدث يلتزم مع الطلب نفسه — الإرسال الفعلي (webhook/
    // CAPI/TikTok) يبقى بعد الالتزام عبر after() كما هو الآن حتى P7 يوحّدها
    // عبر مشغّل الـoutbox.
    await createOutboxEvent(tx, {
      eventType: "order.created",
      entityType: "order",
      entityId: finalOrder.id,
      payload: {
        orderNumber: finalOrder.orderNumber,
        status: finalOrder.status,
        totalDzd: finalOrder.totalDzd,
        customerId: customerMatch.customerId,
        isTest: finalOrder.isTest,
      },
      actorType: "system",
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
    // المخزون نُقص للتوّ، وصفحة المنتج تقرأ من unstable_cache — بلا هذا الإبطال قد
    // تُظهر «متوفر» لقطعة بيعت.
    //
    // داخل after() كبقية الأعمال الجانبية هنا، لا في مسار الاستجابة: إبطال الوسم
    // كتابة على مخزن التخزين المؤقّت، ولا يصحّ أن ينتظرها الزبون بعد أن التزمت
    // معاملته فعلًا. الدالة محروسة بـtry/catch داخليًا فلا تُسقط طلبًا ناجحًا.
    after(() => revalidateStorefrontProducts());
    // إشعار صاحب المتجر (تبويب الإشعارات → «إشعارات الطلبيات») + تنبيه مخزون منخفض
    // بعد الخصم — كلاهما بعد الرد، ولا يرمي أي منهما.
    after(() =>
      notifyOwner(
        "orders",
        [
          `🛒 طلب جديد ${finalOrder.orderNumber}`,
          `${finalOrder.customerFirstName} ${finalOrder.customerLastName} — ${finalOrder.phone}`,
          `${finalOrder.wilayaName} · ${finalOrder.commune}`,
          ...finalOrder.items.map((i) => `• ${i.productNameSnapshot}${i.variantLabelSnapshot ? ` (${i.variantLabelSnapshot})` : ""} ×${i.quantity}`),
          `المجموع: ${formatPrice(finalOrder.totalDzd)}`,
        ].join("\n"),
      ),
    );
    after(() => raiseLowStockAlerts(finalOrder.items.flatMap((i) => (i.productId ? [i.productId] : []))));
    return finalOrder;
  });
}

async function raiseLowStockAlerts(productIds: string[]) {
  const low = await prisma.product.findMany({
    where: { id: { in: productIds }, isPublished: true, inventoryCount: { lte: LOW_STOCK_THRESHOLD } },
    select: { id: true, name: true, inventoryCount: true },
  });
  for (const p of low) {
    await raiseSystemAlertOnce({
      type: "low_stock",
      severity: p.inventoryCount === 0 ? "high" : "medium",
      entityType: "product",
      entityId: p.id,
      message: p.inventoryCount === 0 ? `نفد مخزون «${p.name}»` : `مخزون «${p.name}» منخفض: بقي ${p.inventoryCount}`,
    });
  }
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

// حالات "الطلب لن يُنفَّذ نهائيًا" — المنطق انتقل إلى statusService (آلة الحالات
// الموحدة). هذه الدالة الآن تفوّض لها حصرًا حتى لا يوجد مسار ثانٍ يغيّر الحالة.
export async function updateOrderStatus(
  id: string,
  status: OrderStatus,
  notes?: string,
): Promise<NonNullable<Awaited<ReturnType<typeof ordersRepository.findOrderById>>>> {
  return transitionOrderStatus(id, status, {
    actor: { type: "system" },
    reason: notes ?? null,
  });
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

export class OrderNotPendingError extends Error {
  constructor() {
    super("لا يمكن تغيير التوصيل إلا لطلب قيد الانتظار");
    this.name = "OrderNotPendingError";
  }
}

// تغيير طريقة التوصيل قبل التأكيد — يستعمله الوكيل الذكي عندما يختار الزبون مكتبًا في
// بلدية أخرى أو التوصيل للمنزل بعد أن تبيّن أن بلديته بلا مكتب DHD. السعر يُعاد حسابه
// من تسعيرة الولاية (لا يُمرَّر من الخارج) والمجموع يُحدَّث معه.
export async function updateOrderDelivery(
  id: string,
  input: { deliveryOption: "home" | "office"; commune?: string; address?: string },
) {
  const existing = await ordersRepository.findOrderById(id);
  if (!existing) throw new OrderNotFoundError();
  if (existing.status !== "pending") throw new OrderNotPendingError();

  const wilaya = await findWilayaByCode(existing.wilayaCode);
  if (!wilaya || !wilaya.isActive) throw new WilayaNotFoundError();
  const deliveryPriceDzd = input.deliveryOption === "office" ? wilaya.officePriceDzd : wilaya.homePriceDzd;
  if (deliveryPriceDzd === null) throw new DeliveryOptionUnavailableError();

  return prisma.order.update({
    where: { id },
    data: {
      deliveryOption: input.deliveryOption,
      ...(input.commune ? { commune: input.commune } : {}),
      // العنوان يخص المنزل فقط — عند المكتب يُمسح حتى لا يبقى عنوان قديم مضلِّل
      address: input.deliveryOption === "home" ? (input.address ?? existing.address) : null,
      deliveryPriceDzd,
      totalDzd: Math.max(0, existing.itemsSubtotalDzd + deliveryPriceDzd - existing.discountDzd),
    },
    include: { items: true },
  });
}
