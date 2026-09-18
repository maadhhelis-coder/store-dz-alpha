import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { transitionOrderStatus } from "@/server/modules/orders/statusService";
import { reshipOrder } from "@/server/modules/shipping/shipmentService";
import {
  createReturn,
  restockReturnItems,
  transitionReturnStatus,
  ReturnError,
} from "@/server/modules/returns/returnsService";
import { importCodSettlement, resolveSettlementItem, SettlementError } from "@/server/modules/finance/codSettlementService";
import { createFinancialAdjustment, AdjustmentError } from "@/server/modules/finance/financialAdjustmentsService";
import { getProfitabilityReport, getOrderProfitLine } from "@/server/modules/finance/profitabilityService";
import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/rbac/permissions";
import type { OrderStatus } from "@prisma/client";
import { createAdmin, ensureWilayaCode, newTag, type FixtureTag } from "./support/customerFixtures";

// P6 — المرتجعات والاسترجاع وتسويات COD والتعديلات المالية والربحية على قاعدة حقيقية:
// أقفال الصفوف، القيود، التزامن، idempotency، الأثر التدقيقي، واستثناء isTest.

const maybeDescribe = process.env.TEST_DATABASE_URL ? describe : describe.skip;

maybeDescribe("P6 — المرتجعات والمالية (integration)", () => {
  let tag: FixtureTag;
  let adminId: string;
  let wilayaCode: number;
  let productId: string;
  let categoryId: string;
  const actor = () => ({ type: "admin" as const, id: adminId });
  const orderIds: string[] = [];

  beforeAll(async () => {
    tag = newTag("p6");
    wilayaCode = await ensureWilayaCode();
    adminId = await createAdmin(tag);
    const category = await prisma.category.create({
      data: { slug: `cat-${tag}`, name: `تصنيف ${tag}`, shortDescription: "x", description: "x" },
      select: { id: true },
    });
    categoryId = category.id;
    const product = await prisma.product.create({
      data: {
        slug: `prod-${tag}`,
        name: `منتج ${tag}`,
        categoryId,
        priceDzd: 2_000,
        costDzd: 800,
        shortDescription: "x",
        longDescriptionHtml: "<p>x</p>",
        inventoryCount: 10,
      },
      select: { id: true },
    });
    productId = product.id;
  });

  afterAll(async () => {
    const ids = orderIds;
    await prisma.codSettlementItem.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.codSettlement.deleteMany({ where: { reconciliationKey: { contains: tag } } });
    await prisma.financialAdjustment.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.returnItem.deleteMany({ where: { returnRecord: { orderId: { in: ids } } } });
    await prisma.returnRecord.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.shipmentItem.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.shipment.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.automationRun.deleteMany({ where: { event: { entityId: { in: ids } } } });
    await prisma.domainEvent.deleteMany({
      where: { entityType: "return", payload: { path: ["orderId"], string_contains: tag } },
    });
    await prisma.domainEvent.deleteMany({ where: { entityId: { in: ids } } });
    await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.order.deleteMany({ where: { id: { in: ids } } });
    await prisma.systemAlert.deleteMany({ where: { message: { contains: tag } } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.adminUser.deleteMany({ where: { id: adminId } });
  });

  /** طلب بسطرين: 3 وحدات (800 كلفة) + وحدة بلا تكلفة — الحالة الابتدائية تُكتب مباشرة
   * (الاختبار يقيس P6 لا آلة الحالات). */
  type OrderOverrides = { status?: OrderStatus; deliveredAt?: Date | null; isTest?: boolean; totalDzd?: number; itemsSubtotalDzd?: number };
  async function makeOrder(overrides: OrderOverrides = {}) {
    const order = await prisma.order.create({
      data: {
        orderNumber: `P6-${tag}-${Math.random().toString(36).slice(2, 8)}`,
        status: "delivered",
        deliveredAt: new Date(),
        customerFirstName: "اختبار",
        customerLastName: tag,
        phone: "0550000099",
        wilayaCode,
        wilayaName: "اختبار",
        commune: "اختبار",
        deliveryOption: "home",
        deliveryPriceDzd: 500,
        itemsSubtotalDzd: 8_000,
        discountDzd: 0,
        totalDzd: 8_500,
        packagingCostDzd: 40,
        otherCostDzd: 0,
        isTest: false,
        items: {
          create: [
            {
              productId,
              productNameSnapshot: "أ",
              productSlugSnapshot: "a",
              unitPriceDzd: 2_000,
              unitCostDzd: 800,
              quantity: 3,
              lineTotalDzd: 6_000,
            },
            { productNameSnapshot: "ب", productSlugSnapshot: "b", unitPriceDzd: 2_000, unitCostDzd: null, quantity: 1, lineTotalDzd: 2_000 },
          ],
        },
        ...overrides,
      },
      include: { items: true },
    });
    orderIds.push(order.id);
    return order;
  }

  const stock = async () =>
    (await prisma.product.findUniqueOrThrow({ where: { id: productId }, select: { inventoryCount: true } })).inventoryCount;

  // ------------------------------------------------------------ المرتجعات
  it("دورة إرجاع: رقم دورة تحت قفل الطلب، دورة نشطة واحدة، وسقف الكمية على الدورات غير المرفوضة", async () => {
    const order = await makeOrder();
    const itemA = order.items.find((i) => i.productId === productId)!;

    // سباق إنشاء دورتين: فائز واحد (الفهرس الجزئي + القفل)
    const race = await Promise.allSettled([
      createReturn({ orderId: order.id, reason: "refused", items: [{ orderItemId: itemA.id, quantity: 2 }], actor: actor() }),
      createReturn({ orderId: order.id, reason: "damaged", items: [{ orderItemId: itemA.id, quantity: 1 }], actor: actor() }),
    ]);
    const ok = race.filter((r) => r.status === "fulfilled");
    const failed = race.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect((failed[0].reason as ReturnError).code).toBe("ACTIVE_CYCLE_EXISTS");

    const first = (ok[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof createReturn>>>).value;
    expect(first.cycleNumber).toBe(1);
    expect(first.returnNumber).toBe(`${order.orderNumber}-R1`);

    // الكمية غير قابلة للتجاوز عبر الدورات: بعد إغلاق الأولى (2 من 3) الثانية تقبل 1 لا 2
    await transitionReturnStatus({ returnId: first.id, to: "closed", actor: actor() });
    await expect(
      createReturn({ orderId: order.id, reason: "refused", items: [{ orderItemId: itemA.id, quantity: 2 }], actor: actor() }),
    ).rejects.toMatchObject({ code: "QUANTITY_EXCEEDED" });
    const second = await createReturn({
      orderId: order.id,
      reason: "refused",
      items: [{ orderItemId: itemA.id, quantity: 1 }],
      actor: actor(),
    });
    expect(second.cycleNumber).toBe(2);

    // UNIQUE(order_id, cycle_number) في القاعدة نفسها
    await expect(
      prisma.returnRecord.create({
        data: { orderId: order.id, cycleNumber: 2, returnNumber: `${order.orderNumber}-R2-dup`, reason: "refused" },
      }),
    ).rejects.toMatchObject({ code: "P2002" });

    const audits = await prisma.auditLog.count({ where: { action: "return_create", entityId: { in: [first.id, second.id] } } });
    expect(audits).toBe(2);
  });

  it("طلب لم يصل الناقل لا يقبل دورة إرجاع", async () => {
    const order = await makeOrder({ status: "confirmed", deliveredAt: null });
    await expect(
      createReturn({ orderId: order.id, reason: "refused", items: [{ orderItemId: order.items[0].id, quantity: 1 }], actor: actor() }),
    ).rejects.toMatchObject({ code: "ORDER_NOT_RETURNABLE" });
  });

  it("الاسترجاع: للفارق فقط، idempotent، آمن تحت التزامن، يرفض التناقص، وrestocked_quantity ≤ quantity في القاعدة", async () => {
    const order = await makeOrder();
    const itemA = order.items.find((i) => i.productId === productId)!;
    const ret = await createReturn({ orderId: order.id, reason: "refused", items: [{ orderItemId: itemA.id, quantity: 3 }], actor: actor() });
    const returnItemId = ret.items[0].id;

    // قبل الاستلام: ممنوع
    await expect(
      restockReturnItems({ returnId: ret.id, items: [{ returnItemId, restockedQuantity: 1 }], actor: actor() }),
    ).rejects.toMatchObject({ code: "RESTOCK_NOT_ALLOWED" });
    const before = await stock();
    await transitionReturnStatus({ returnId: ret.id, to: "received", actor: actor() });
    // استلام دورة طلب مُسلَّم = الطلب returned عبر آلة الحالات، وبلا أي استرجاع مخزون
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("returned");
    expect(await stock()).toBe(before);

    // طلبان متزامنان بنفس الكمية: فارق واحد فقط يُطبَّق
    const race = await Promise.all([
      restockReturnItems({ returnId: ret.id, items: [{ returnItemId, restockedQuantity: 2 }], actor: actor() }),
      restockReturnItems({ returnId: ret.id, items: [{ returnItemId, restockedQuantity: 2 }], actor: actor() }),
    ]);
    expect(race.map((r) => r.applied.length).sort()).toEqual([0, 1]);
    expect(await stock()).toBe(before + 2);
    expect(race[0].status).toBe("partially_restocked");

    // تكرار الطلب نفسه: لا أثر
    const again = await restockReturnItems({ returnId: ret.id, items: [{ returnItemId, restockedQuantity: 2 }], actor: actor() });
    expect(again.applied).toHaveLength(0);
    expect(await stock()).toBe(before + 2);

    // التناقص مرفوض؛ التجاوز مرفوض (خدمة وقاعدة)
    await expect(
      restockReturnItems({ returnId: ret.id, items: [{ returnItemId, restockedQuantity: 1 }], actor: actor() }),
    ).rejects.toMatchObject({ code: "RESTOCK_DECREASE_FORBIDDEN" });
    await expect(
      restockReturnItems({ returnId: ret.id, items: [{ returnItemId, restockedQuantity: 4 }], actor: actor() }),
    ).rejects.toMatchObject({ code: "RESTOCK_EXCEEDS_QUANTITY" });
    await expect(prisma.returnItem.update({ where: { id: returnItemId }, data: { restockedQuantity: 9 } })).rejects.toThrow();

    // الاسترجاع الكامل ينقل الدورة إلى restocked، وكل فارق موثّق
    const full = await restockReturnItems({ returnId: ret.id, items: [{ returnItemId, restockedQuantity: 3 }], actor: actor() });
    expect(full.status).toBe("restocked");
    expect(await stock()).toBe(before + 3);
    expect(await prisma.auditLog.count({ where: { action: "return_restock", entityId: returnItemId } })).toBe(2);

    // إعادة الشحن بعد إرجاع مُسترجَع: يُخصم ما عاد للمخزون فقط (3)، لا الكمية كاملة
    await reshipOrder({ orderId: order.id, actor: actor(), reason: "استبدال" });
    expect(await stock()).toBe(before);
  });

  it("الاستبدال صريح ولا يُعدّ رفضًا في المقاييس", async () => {
    const window = { from: new Date(Date.now() - 3_600_000), to: new Date(Date.now() + 3_600_000) };
    const before = (await getProfitabilityReport(window, "order")).rates.refusedReturns;
    const order = await makeOrder();
    const itemA = order.items.find((i) => i.productId === productId)!;
    const ret = await createReturn({
      orderId: order.id,
      reason: "refused",
      isExchange: true,
      items: [{ orderItemId: itemA.id, quantity: 1 }],
      actor: actor(),
    });
    expect(ret.isExchange).toBe(true);
    // دورة الاستبدال بسبب refused لا تزيد عدّاد الرفض (القاعدة مشتركة مع اختبارات أخرى — نقارن قبل/بعد)
    const after = (await getProfitabilityReport(window, "order")).rates.refusedReturns;
    expect(after).toBe(before);
  });

  // ------------------------------------------------------------ تسويات COD
  it("استيراد التسوية: مطابقة/فرق/بلا طلب، cod_collected عبر آلة الحالات، ولا دهس لتحصيل سابق", async () => {
    const matched = await makeOrder();
    const short = await makeOrder({ totalDzd: 9_000 });
    const testOrder = await makeOrder({ isTest: true });
    const lines = [
      { orderNumber: matched.orderNumber, collectedDzd: 8_500 },
      { orderNumber: short.orderNumber, collectedDzd: 8_000 },
      { orderNumber: testOrder.orderNumber, collectedDzd: 8_500 },
      { trackingNumber: `NOPE-${tag}`, collectedDzd: 100 },
    ];
    const first = await importCodSettlement({
      provider: "DHD",
      settlementDate: new Date("2026-09-15T00:00:00Z"),
      reference: `ref-${tag}`,
      lines,
      actor: actor(),
    });
    expect(first.replayed).toBe(false);
    expect(first.matched).toBe(1);
    expect(first.discrepancies).toBe(1);
    expect(first.unmatched).toHaveLength(1);
    expect(first.status).toBe("discrepancy");

    const m = await prisma.order.findUniqueOrThrow({ where: { id: matched.id } });
    expect(m.status).toBe("cod_collected");
    expect(m.codCollectedAmountDzd).toBe(8_500);
    expect(m.codCollectedAt?.toISOString()).toBe("2026-09-15T00:00:00.000Z");
    const t = await prisma.order.findUniqueOrThrow({ where: { id: testOrder.id } });
    expect(t.codCollectedAt).toBeNull(); // طلب اختبار: لا أثر مالي

    // إعادة الاستيراد نفسه: لا تكرار ولا أثر جديد
    const replay = await importCodSettlement({
      provider: "dhd",
      settlementDate: new Date("2026-09-15T12:00:00Z"),
      reference: `ref-${tag}`,
      lines,
      actor: actor(),
    });
    expect(replay.replayed).toBe(true);
    expect(replay.settlementId).toBe(first.settlementId);
    expect(await prisma.codSettlement.count({ where: { reconciliationKey: `2026-09-15:ref:ref-${tag}` } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "cod_collected", entityId: matched.id } })).toBe(1);

    // نفس المرجع بمحتوى مختلف: تعارض صريح، لا كتابة
    await expect(
      importCodSettlement({
        provider: "dhd",
        settlementDate: new Date("2026-09-15T00:00:00Z"),
        reference: `ref-${tag}`,
        lines: [{ orderNumber: matched.orderNumber, collectedDzd: 1 }],
        actor: actor(),
      }),
    ).rejects.toBeInstanceOf(SettlementError);
    expect(await prisma.systemAlert.count({ where: { type: "cod_settlement_conflict", entityId: first.settlementId } })).toBe(1);

    // تحصيل سابق بمبلغ مختلف في كشف آخر: فرق ولا دهس
    const second = await importCodSettlement({
      provider: "dhd",
      settlementDate: new Date("2026-09-16T00:00:00Z"),
      reference: `ref2-${tag}`,
      lines: [{ orderNumber: matched.orderNumber, collectedDzd: 8_000 }],
      actor: actor(),
    });
    expect(second.discrepancies).toBe(1);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: matched.id } })).codCollectedAmountDzd).toBe(8_500);

    // الحل: سطر الفرق → resolved، والتسوية تُغلق حين لا يبقى مفتوح
    const item = await prisma.codSettlementItem.findFirstOrThrow({ where: { settlementId: second.settlementId } });
    await resolveSettlementItem({ itemId: item.id, settlementId: second.settlementId, reason: "الناقل خصم رسوم", actor: actor() });
    const closed = await prisma.codSettlement.findUniqueOrThrow({ where: { id: second.settlementId } });
    expect(closed.status).toBe("resolved");
    await expect(resolveSettlementItem({ itemId: item.id, reason: "x", actor: actor() })).rejects.toMatchObject({
      code: "ALREADY_RESOLVED",
    });
  });

  it("سباق استيرادين متزامنين لنفس الكشف: تسوية واحدة والآخر replayed", async () => {
    const order = await makeOrder();
    const input = () => ({
      provider: "dhd",
      settlementDate: new Date("2026-09-17T00:00:00Z"),
      reference: `race-${tag}`,
      lines: [{ orderNumber: order.orderNumber, collectedDzd: 8_500 }],
      actor: actor(),
    });
    const [a, b] = await Promise.all([importCodSettlement(input()), importCodSettlement(input())]);
    expect(a.settlementId).toBe(b.settlementId);
    expect([a.replayed, b.replayed].filter(Boolean)).toHaveLength(1);
    expect(await prisma.codSettlement.count({ where: { reconciliationKey: `2026-09-17:ref:race-${tag}` } })).toBe(1);
  });

  it("المحصَّل فوق القابل للتحصيل لا يُسجَّل بلا تعديل مالي موثّق", async () => {
    const order = await makeOrder();
    const over = await importCodSettlement({
      provider: "dhd",
      settlementDate: new Date("2026-09-18T00:00:00Z"),
      reference: `over-${tag}`,
      lines: [{ orderNumber: order.orderNumber, collectedDzd: 9_000 }],
      actor: actor(),
    });
    expect(over.discrepancies).toBe(1);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).codCollectedAt).toBeNull();

    // بعد تعديل دائن موثّق يرفع القابل للتحصيل إلى 9000 يُقبل في كشف جديد
    await createFinancialAdjustment({
      orderId: order.id,
      type: "shipping",
      amountDzd: 500,
      direction: "credit",
      reason: "رسوم إضافية على الزبون",
      actor: actor(),
    });
    const ok = await importCodSettlement({
      provider: "dhd",
      settlementDate: new Date("2026-09-19T00:00:00Z"),
      reference: `over2-${tag}`,
      lines: [{ orderNumber: order.orderNumber, collectedDzd: 9_000 }],
      actor: actor(),
    });
    expect(ok.matched).toBe(1);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).codCollectedAmountDzd).toBe(9_000);
  });

  // ------------------------------------------------------------ التعديلات المالية
  it("التعديل المالي: غير قابل للتغيير، التصحيح تعويضي مرتبط بالأصل، ممنوع على طلب اختبار، ومبلغ ≥ 0 في القاعدة", async () => {
    const order = await makeOrder();
    const original = await createFinancialAdjustment({
      orderId: order.id,
      type: "partial_refund",
      amountDzd: 1_000,
      direction: "debit",
      reason: "خصم بعد الشكوى",
      actor: actor(),
    });
    const correction = await createFinancialAdjustment({
      orderId: order.id,
      type: "partial_refund",
      amountDzd: 1_000,
      direction: "credit",
      reason: "إلغاء الخصم — خطأ إدخال",
      correctionOfId: original.id,
      actor: actor(),
    });
    expect(correction.correctionOfId).toBe(original.id);
    const stored = await prisma.financialAdjustment.findUniqueOrThrow({ where: { id: original.id } });
    expect(stored.amountDzd).toBe(1_000); // الأصل لم يُمسّ
    expect(
      await prisma.auditLog.count({ where: { action: "financial_adjustment_create", entityId: { in: [original.id, correction.id] } } }),
    ).toBe(2);

    await expect(
      createFinancialAdjustment({ orderId: order.id, type: "other", amountDzd: -5, direction: "debit", reason: "x", actor: actor() }),
    ).rejects.toBeInstanceOf(AdjustmentError);
    await expect(
      prisma.financialAdjustment.create({ data: { orderId: order.id, type: "other", amountDzd: -5, direction: "debit", reason: "x" } }),
    ).rejects.toThrow();
    const other = await makeOrder();
    await expect(
      createFinancialAdjustment({
        orderId: other.id,
        type: "other",
        amountDzd: 5,
        direction: "debit",
        reason: "x",
        correctionOfId: original.id,
        actor: actor(),
      }),
    ).rejects.toMatchObject({ code: "ORIGINAL_ORDER_MISMATCH" });
    const testOrder = await makeOrder({ isTest: true });
    await expect(
      createFinancialAdjustment({ orderId: testOrder.id, type: "other", amountDzd: 5, direction: "debit", reason: "x", actor: actor() }),
    ).rejects.toMatchObject({ code: "TEST_ORDER" });
    // الأصل لا يُحذف ما دام له تصحيح (FK Restrict)
    await expect(prisma.financialAdjustment.delete({ where: { id: original.id } })).rejects.toThrow();
  });

  // ------------------------------------------------------------ الربحية
  it("الربحية من اللقطات، isTest مستبعد على مستوى الاستعلام، والتعديلات تدخل الصافي", async () => {
    const order = await makeOrder();
    const testOrder = await makeOrder({ isTest: true, totalDzd: 999_999, itemsSubtotalDzd: 999_999 });
    await createFinancialAdjustment({ orderId: order.id, type: "other", amountDzd: 100, direction: "debit", reason: "x", actor: actor() });
    // تغيير كلفة المنتج الحالية لا يمسّ الربح التاريخي (لقطة unitCostDzd)
    await prisma.product.update({ where: { id: productId }, data: { costDzd: 5_000 } });

    const line = await getOrderProfitLine(order.id);
    expect(line).not.toBeNull();
    expect(line!.netSalesDzd).toBe(8_000);
    expect(line!.deliveryRevenueDzd).toBe(500);
    expect(line!.cogsDzd).toBe(2_400); // 3 × 800 من اللقطة، البند بلا تكلفة = 0
    expect(line!.unknownCostItems).toBe(1);
    expect(line!.carrierCostDzd).toBe(500);
    expect(line!.carrierCostProvenance).toBe("estimated");
    expect(line!.adjustmentsDzd).toBe(-100);
    expect(line!.netProfitDzd).toBe(8_000 + 500 - 2_400 - 500 - 40 - 100);

    expect(await getOrderProfitLine(testOrder.id)).toBeNull();
    const report = await getProfitabilityReport(
      { from: new Date(Date.now() - 3_600_000), to: new Date(Date.now() + 3_600_000) },
      "order",
    );
    expect(report.rows.some((r) => r.key === testOrder.id)).toBe(false);
    expect(report.rows.some((r) => r.key === order.id)).toBe(true);
    await prisma.product.update({ where: { id: productId }, data: { costDzd: 800 } });
  });

  // ------------------------------------------------------------ إصلاحات المراجعة النهائية
  it("مطابقة سطر التسوية برقم التتبّع رغم اختلاف حالة أحرف provider (الشحنات DHD / التسوية dhd)", async () => {
    const order = await makeOrder();
    const tracking = `TRK-${tag}-match`;
    await prisma.shipment.create({
      data: { orderId: order.id, provider: "DHD", trackingNumber: tracking, status: "delivered", codAmountDzd: order.totalDzd },
    });
    const res = await importCodSettlement({
      provider: "dhd",
      settlementDate: new Date("2026-09-20T00:00:00Z"),
      reference: `trk-${tag}`,
      lines: [{ trackingNumber: tracking, collectedDzd: 8_500 }],
      actor: actor(),
    });
    expect(res.unmatched).toEqual([]);
    expect(res.matched).toBe(1);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).codCollectedAmountDzd).toBe(8_500);
  });

  it("التعديل المالي بمفتاح idempotency: إعادة الإرسال تُرجع نفس السجل، ومفتاح بمحتوى مختلف يُرفض", async () => {
    const order = await makeOrder();
    const key = `adj-${tag}-${Math.random().toString(36).slice(2, 10)}`;
    const base = {
      orderId: order.id,
      type: "other" as const,
      amountDzd: 250,
      direction: "debit" as const,
      reason: "خصم",
      idempotencyKey: key,
      actor: actor(),
    };
    // متزامنان بنفس المفتاح: عقد executeIdempotent — مُنفَّذ واحد فقط، والخاسر إمّا نفس السجل
    // أو IDEMPOTENCY_IN_FLIGHT (409 يُعاد بعدها) — لا سجل ثانٍ في الحالتين
    const race = await Promise.allSettled([createFinancialAdjustment(base), createFinancialAdjustment(base)]);
    const ok = race.filter((r) => r.status === "fulfilled");
    expect(ok.length).toBeGreaterThanOrEqual(1);
    for (const r of race) {
      if (r.status === "rejected") expect(r.reason).toMatchObject({ code: "IDEMPOTENCY_IN_FLIGHT" });
    }
    const a = ok[0].value;
    const again = await createFinancialAdjustment(base);
    expect(again.id).toBe(a.id);
    expect(await prisma.financialAdjustment.count({ where: { orderId: order.id } })).toBe(1);
    await expect(createFinancialAdjustment({ ...base, amountDzd: 999 })).rejects.toMatchObject({
      code: "IDEMPOTENCY_KEY_REUSED",
    });
    await prisma.idempotencyKey.deleteMany({ where: { idempotencyKey: key } });
  });

  it("بند مكرَّر في طلب الاسترجاع وشحنة من طلب آخر يُرفضان بوضوح (لا 500)", async () => {
    const order = await makeOrder();
    const other = await makeOrder();
    const foreign = await prisma.shipment.create({
      data: { orderId: other.id, provider: "DHD", status: "delivered", codAmountDzd: other.totalDzd },
      select: { id: true },
    });
    const itemA = order.items.find((i) => i.productId === productId)!;
    await expect(
      createReturn({
        orderId: order.id,
        reason: "refused",
        shipmentId: foreign.id,
        items: [{ orderItemId: itemA.id, quantity: 1 }],
        actor: actor(),
      }),
    ).rejects.toMatchObject({ code: "INVALID_ITEMS" });
    const ret = await createReturn({ orderId: order.id, reason: "refused", items: [{ orderItemId: itemA.id, quantity: 2 }], actor: actor() });
    await transitionReturnStatus({ returnId: ret.id, to: "received", actor: actor() });
    const id = ret.items[0].id;
    await expect(
      restockReturnItems({
        returnId: ret.id,
        items: [
          { returnItemId: id, restockedQuantity: 1 },
          { returnItemId: id, restockedQuantity: 2 },
        ],
        actor: actor(),
      }),
    ).rejects.toMatchObject({ code: "INVALID_ITEMS" });
  });

  // ------------------------------------------------------------ RBAC
  it("role_permissions في القاعدة تطابق الكتالوج لصلاحيات P6 (deny by default)", async () => {
    const rows = await prisma.rolePermission.findMany({ select: { role: true, permission: true } });
    const has = (role: string, p: string) => rows.some((r) => r.role === role && r.permission === p);
    const perms = ["returns.read", "returns.manage", "inventory.adjust", "finance.read", "finance.adjust", "finance.reconcile"] as const;
    for (const p of perms) {
      for (const role of ["owner", "admin", "accountant", "logistics_agent", "viewer", "packing_agent"] as const) {
        expect(has(role, p), `${role}:${p}`).toBe((DEFAULT_ROLE_PERMISSIONS[role] as readonly string[]).includes(p));
      }
    }
    expect(has("accountant", "finance.reconcile")).toBe(true);
    expect(has("logistics_agent", "returns.manage")).toBe(true);
    expect(has("logistics_agent", "inventory.adjust")).toBe(false);
    expect(has("viewer", "finance.adjust")).toBe(false);
    expect(has("packing_agent", "finance.read")).toBe(false);
  });

  it("returned لا يُعيد مخزونًا عبر انتقال الحالة (السلوك القديم أُزيل)", async () => {
    const before = await stock();
    const order = await makeOrder({ status: "return_to_origin", deliveredAt: null });
    await transitionOrderStatus(order.id, "returned", { actor: { type: "carrier" } });
    expect(await stock()).toBe(before);
  });
});
