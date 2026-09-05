import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { listCustomers, getCustomer360 } from "@/server/modules/customers/customerQueryService";
import { getCustomerTimeline } from "@/server/modules/customers/customerTimelineService";
import { recomputeCustomerSegments } from "@/server/modules/customers/segmentationService";
import {
  cleanupByTag,
  createCustomer,
  createOrder,
  ensureWilayaCode,
  newTag,
  type FixtureTag,
} from "./support/customerFixtures";

// Customer 360 على قاعدة حقيقية: CLV من التعريفات الرسمية، ترقيم timeline
// الحتمي بالمؤشر، ترتيب القائمة الحتمي، واستثناء isTest على مستوى القاعدة.
// يتطلب TEST_DATABASE_URL — بدونه تُتخطى المجموعة كاملة بلا أي اتصال.

const maybeDescribe = process.env.TEST_DATABASE_URL ? describe : describe.skip;

maybeDescribe("ملف العميل 360 (integration)", () => {
  let tag: FixtureTag;
  let wilayaCode: number;

  beforeAll(async () => {
    tag = newTag("c360");
    wilayaCode = await ensureWilayaCode();
  });

  afterAll(async () => {
    await cleanupByTag(tag);
  });

  it("CLV من التعريفات الرسمية: الاعتراف يبدأ عند التسليم والمرتجع يُخصم", async () => {
    const customer = await createCustomer(tag);
    // مُسلَّم ومحصَّل: 10000، تكاليف 500+200+300 وبضاعة 4000
    await createOrder(tag, {
      customerId: customer.id,
      wilayaCode,
      status: "delivered",
      totalDzd: 10_000,
      deliveredAt: new Date(),
      codCollectedAt: new Date(),
      codCollectedAmountDzd: 10_000,
      deliveryPriceDzd: 500,
      packagingCostDzd: 200,
      otherCostDzd: 300,
      itemUnitCostDzd: 4_000,
    });
    // غير مُسلَّم: يدخل Ordered فقط، ولا يُعترف به
    await createOrder(tag, { customerId: customer.id, wilayaCode, totalDzd: 7_000 });
    // ملغى: خارج الأنبوب كله
    await createOrder(tag, {
      customerId: customer.id,
      wilayaCode,
      status: "cancelled",
      totalDzd: 5_000,
    });

    const data = await getCustomer360({ customerId: customer.id });
    const m = data!.metrics;

    expect(m.ordersCount).toBe(2); // الملغى مستبعد
    expect(m.orderedRevenueDzd).toBe(17_000);
    expect(m.deliveredRevenueDzd).toBe(10_000);
    expect(m.collectedRevenueDzd).toBe(10_000);
    expect(m.grossRecognizedRevenueDzd).toBe(10_000);
    expect(m.returnedDeductionDzd).toBe(0);
    expect(m.netRecognizedRevenueDzd).toBe(10_000);
    expect(m.revenueClvDzd).toBe(10_000);
    expect(m.costsOnRecognizedDzd).toBe(5_000);
    expect(m.grossProfitClvDzd).toBe(5_000);
    expect(m.netProfitClvDzd).toBe(5_000); // لا تكاليف إرجاع
    expect(m.recognizedOrdersCount).toBe(1);
  });

  it("طلب مرتجع بعد التسليم يُخصم من المعترف به", async () => {
    const customer = await createCustomer(tag);
    await createOrder(tag, {
      customerId: customer.id,
      wilayaCode,
      status: "delivered",
      totalDzd: 8_000,
      deliveredAt: new Date(),
      returnedAt: new Date(),
      itemUnitCostDzd: 0,
    });

    const data = await getCustomer360({ customerId: customer.id });
    expect(data!.metrics.grossRecognizedRevenueDzd).toBe(8_000);
    expect(data!.metrics.returnedDeductionDzd).toBe(8_000);
    expect(data!.metrics.netRecognizedRevenueDzd).toBe(0);
    expect(data!.metrics.returnedOrdersCount).toBe(1);
  });

  it("قاعدة البيانات ترفض ربط طلب isTest بعميل، والطلبات التجريبية خارج كل الحسابات", async () => {
    const customer = await createCustomer(tag);
    await expect(
      createOrder(tag, { customerId: customer.id, wilayaCode, isTest: true }),
    ).rejects.toThrow();

    // طلب تجريبي غير مرتبط (المسار الوحيد المسموح) لا يظهر في أي عدّاد
    await createOrder(tag, { customerId: null, wilayaCode, isTest: true, totalDzd: 99_000 });
    const data = await getCustomer360({ customerId: customer.id });
    expect(data!.metrics.orderedRevenueDzd).toBe(0);
    expect(data!.orders).toHaveLength(0);
  });

  it("ترقيم timeline بالمؤشر حتمي: بلا تكرار ولا تخطٍّ عبر الصفحات", async () => {
    const customer = await createCustomer(tag);
    const orderId = await createOrder(tag, { customerId: customer.id, wilayaCode });
    const base = Date.now();
    await prisma.orderStatusHistory.createMany({
      data: Array.from({ length: 25 }, (_, i) => ({
        orderId,
        oldStatus: "pending" as const,
        newStatus: "confirmed" as const,
        actorType: "system" as const,
        reason: `حدث ${i}`,
        createdAt: new Date(base - i * 1000),
      })),
    });

    const first = await getCustomerTimeline({ customerId: customer.id });
    expect(first.items).toHaveLength(20);
    expect(first.nextCursor).not.toBeNull();

    const second = await getCustomerTimeline({
      customerId: customer.id,
      cursor: first.nextCursor,
    });
    expect(second.items).toHaveLength(5);
    expect(second.nextCursor).toBeNull();

    const ids = [...first.items, ...second.items].map((e) => e.id);
    expect(new Set(ids).size).toBe(25); // لا تكرار ولا فقدان

    // الترتيب حتمي تنازليًا في كل صفحة
    const times = [...first.items, ...second.items].map((e) => e.createdAt.getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  it("ترتيب قائمة العملاء حتمي: آخر طلب تنازليًا ثم id تصاعديًا عند التعادل", async () => {
    const sameMoment = new Date("2026-01-01T10:00:00.000Z");
    const older = new Date("2025-12-01T10:00:00.000Z");
    const a = await createCustomer(tag);
    const b = await createCustomer(tag);
    const c = await createCustomer(tag);
    await prisma.customer.updateMany({
      where: { id: { in: [a.id, b.id] } },
      data: { lastOrderAt: sameMoment },
    });
    await prisma.customer.update({ where: { id: c.id }, data: { lastOrderAt: older } });

    const page = await listCustomers({ filters: { search: `عميل ${tag}` }, pageSize: 100 });
    const ordered = page.items.filter((i) => [a.id, b.id, c.id].includes(i.id)).map((i) => i.id);
    const tiedExpected = [a.id, b.id].sort();
    expect(ordered).toEqual([...tiedExpected, c.id]);

    // نفس الاستعلام مرتين → نفس الترتيب بالضبط (لا تذبذب)
    const again = await listCustomers({ filters: { search: `عميل ${tag}` }, pageSize: 100 });
    expect(again.items.map((i) => i.id)).toEqual(page.items.map((i) => i.id));
  });

  it("سقف حجم الصفحة مفروض من الخادم مهما طلب المستدعي", async () => {
    const page = await listCustomers({ pageSize: 10_000 });
    expect(page.pageSize).toBe(100);
    expect(page.items.length).toBeLessThanOrEqual(100);
  });

  it("الهواتف تُعاد مقنّعة في القائمة وفي الـ360", async () => {
    const customer = await createCustomer(tag);
    const page = await listCustomers({ filters: { search: `عميل ${tag}` }, pageSize: 100 });
    const row = page.items.find((i) => i.id === customer.id);
    expect(row?.phoneMasked).toMatch(/^05\*{7}\d{2}$/);

    const data = await getCustomer360({ customerId: customer.id });
    expect(data!.customer.phoneMasked).toMatch(/^05\*{7}\d{2}$/);
    expect(data!.customer.phones.every((p) => /^05\*{7}\d{2}$/.test(p.phoneMasked))).toBe(true);
  });

  it("القطاعات تُكتب فعليًا: at_risk وhigh_rto بأساسي واحد كحد أقصى", async () => {
    const customer = await createCustomer(tag);
    // 4 طلبات مُسلَّمة منها 2 مرتجعة = 50% ≥ عتبة 30% وعيّنة ≥ 3
    for (let i = 0; i < 4; i++) {
      await createOrder(tag, {
        customerId: customer.id,
        wilayaCode,
        status: "delivered",
        totalDzd: 5_000,
        deliveredAt: new Date(),
        returnedAt: i < 2 ? new Date() : null,
        itemUnitCostDzd: 0,
      });
    }
    // آخر طلب داخل نافذة الإنذار (بين at_risk_days وinactive_days)
    await prisma.customer.update({
      where: { id: customer.id },
      data: { lastOrderAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) },
    });

    const segments = await recomputeCustomerSegments(customer.id);
    expect(segments).toContain("high_rto");
    expect(segments).toContain("at_risk");
    expect(segments).not.toContain("inactive");

    const rows = await prisma.customerSegment.findMany({
      where: { customerId: customer.id },
      select: { segment: true, isPrimary: true },
    });
    expect(rows.map((r) => r.segment).sort()).toEqual([...segments].sort());
    expect(rows.filter((r) => r.isPrimary)).toHaveLength(1); // القيد الجزئي 0..1

    // إعادة التشغيل حتمية: نفس النتيجة بلا تكرار صفوف
    const again = await recomputeCustomerSegments(customer.id);
    expect([...again].sort()).toEqual([...segments].sort());
    expect(await prisma.customerSegment.count({ where: { customerId: customer.id } })).toBe(
      rows.length,
    );
  });

  it("عميل غير موجود → null لا استثناء", async () => {
    expect(await getCustomer360({ customerId: "00000000-0000-4000-8000-00000000dead" })).toBeNull();
  });
});
