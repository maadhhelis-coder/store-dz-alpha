import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import {
  mergeCustomers,
  unmergeCustomer,
  CustomerMergeError,
} from "@/server/modules/customers/mergeService";
import {
  cleanupByTag,
  createAdmin,
  createCustomer,
  createOrder,
  ensureWilayaCode,
  newTag,
  nextPhone,
  type FixtureTag,
} from "./support/customerFixtures";

// ===========================================================================
// دمج/فصل العملاء — السيناريوهات الإلزامية العشرة (P3)
// ===========================================================================
// يتطلب TEST_DATABASE_URL (قاعدة اختبار مخصصة). عند غيابه تُتخطى المجموعة
// كاملة بصوت واضح ولا يُفتح أي اتصال — لا سيناريو هنا يلمس قاعدة الإنتاج.
// كل حالة تنشئ بيانتها بوسم خاص وتُنظَّف بالوسم في النهاية.

const maybeDescribe = process.env.TEST_DATABASE_URL ? describe : describe.skip;

maybeDescribe("دمج وفصل العملاء (integration)", () => {
  let tag: FixtureTag;
  let adminId: string;
  let wilayaCode: number;

  beforeAll(async () => {
    tag = newTag("merge");
    wilayaCode = await ensureWilayaCode();
    adminId = await createAdmin(tag);
  });

  afterAll(async () => {
    await cleanupByTag(tag);
  });

  // ---------------------------------------------------------------- 1 + 10
  it("سباق دمج نفس الزوج → فائز واحد فقط، سجل دمج واحد، بلا تكرار أو فساد", async () => {
    const survivor = await createCustomer(tag);
    const merged = await createCustomer(tag);
    const orderId = await createOrder(tag, { customerId: merged.id, wilayaCode });

    const results = await Promise.allSettled([
      mergeCustomers({ survivorId: survivor.id, mergedId: merged.id, actorId: adminId }),
      mergeCustomers({ survivorId: survivor.id, mergedId: merged.id, actorId: adminId }),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);

    // لا تكرار: سجل دمج واحد، والطلب على الـsurvivor مرة واحدة لا أكثر
    const mergeRows = await prisma.customerMerge.count({ where: { mergedId: merged.id } });
    expect(mergeRows).toBe(1);
    const order = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { customerId: true },
    });
    expect(order.customerId).toBe(survivor.id);
    const survivorOrders = await prisma.order.count({ where: { customerId: survivor.id } });
    expect(survivorOrders).toBe(1);
  });

  // -------------------------------------------------------------------- 2
  it("دمج A+B وB+A متزامنين → واحد فقط ينجح (القفل التصاعدي يمنع التعارض المزدوج)", async () => {
    const a = await createCustomer(tag);
    const b = await createCustomer(tag);

    const results = await Promise.allSettled([
      mergeCustomers({ survivorId: a.id, mergedId: b.id, actorId: adminId }),
      mergeCustomers({ survivorId: b.id, mergedId: a.id, actorId: adminId }),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected");
    expect(rejected?.reason).toBeInstanceOf(CustomerMergeError);

    const [aRow, bRow] = await Promise.all([
      prisma.customer.findUniqueOrThrow({ where: { id: a.id }, select: { status: true } }),
      prisma.customer.findUniqueOrThrow({ where: { id: b.id }, select: { status: true } }),
    ]);
    // بالضبط واحد مؤرشف — لا الاثنان ولا لا أحد
    expect([aRow.status, bRow.status].filter((s) => s === "archived")).toHaveLength(1);
  });

  // -------------------------------------------------------------------- 3
  it("تعارض هاتف أساسي متطابق → PHONE_COLLISION بلا أي نقل", async () => {
    const shared = nextPhone();
    const survivor = await createCustomer(tag, { phone: shared });
    // هاتف ثانٍ فريد في customer_phones (القيد عالمي) لكن primaryPhone نصيًا متطابق
    const merged = await createCustomer(tag);
    await prisma.customer.update({ where: { id: merged.id }, data: { primaryPhone: shared } });
    const orderId = await createOrder(tag, { customerId: merged.id, wilayaCode });

    await expect(
      mergeCustomers({ survivorId: survivor.id, mergedId: merged.id, actorId: adminId }),
    ).rejects.toMatchObject({ code: "PHONE_COLLISION" });

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { customerId: true },
    });
    expect(order.customerId).toBe(merged.id); // لا نقل جزئي
    expect(await prisma.customerMerge.count({ where: { mergedId: merged.id } })).toBe(0);
  });

  // -------------------------------------------------------------------- 5
  it("عميل مؤرشف → MERGED_NOT_ACTIVE، وsurvivor مؤرشف → SURVIVOR_NOT_ACTIVE", async () => {
    const active = await createCustomer(tag);
    const archived = await createCustomer(tag, { status: "archived" });

    await expect(
      mergeCustomers({ survivorId: active.id, mergedId: archived.id, actorId: adminId }),
    ).rejects.toMatchObject({ code: "MERGED_NOT_ACTIVE" });

    await expect(
      mergeCustomers({ survivorId: archived.id, mergedId: active.id, actorId: adminId }),
    ).rejects.toMatchObject({ code: "SURVIVOR_NOT_ACTIVE" });

    await expect(
      mergeCustomers({ survivorId: active.id, mergedId: active.id, actorId: adminId }),
    ).rejects.toMatchObject({ code: "SAME_CUSTOMER" });
  });

  // -------------------------------------------------------------- 6 + 9 + 7
  it("عميل بطلبات ومحاولات ومهام → نقل كامل، manifest دقيق، توثيق، ثم فصل يستعيد المانيفست حصرًا", async () => {
    const survivor = await createCustomer(tag);
    const merged = await createCustomer(tag);
    const orderId = await createOrder(tag, { customerId: merged.id, wilayaCode });
    await prisma.confirmationAttempt.create({
      data: { orderId, customerId: merged.id, outcome: "no_answer" },
    });
    await prisma.task.create({
      data: { type: "follow_up", orderId, customerId: merged.id, source: "manual" },
    });
    await prisma.communication.create({
      data: { customerId: merged.id, orderId, channel: "sms", provider: "test" },
    });

    const { mergeId, movedCounts } = await mergeCustomers({
      survivorId: survivor.id,
      mergedId: merged.id,
      actorId: adminId,
      reason: "اختبار تكامل",
    });
    expect(movedCounts).toMatchObject({
      orders: 1,
      confirmationAttempts: 1,
      tasks: 1,
      communications: 1,
      phones: 1,
    });

    // الهوية: هاتف المدموج صار تابعًا للـsurvivor → المدموج غير قابل للمطابقة
    const phone = await prisma.customerPhone.findUniqueOrThrow({
      where: { phoneNormalized: merged.phone },
      select: { customerId: true, phoneType: true },
    });
    expect(phone.customerId).toBe(survivor.id);
    expect(phone.phoneType).toBe("alternative");
    expect(await prisma.customerPhone.count({ where: { customerId: merged.id } })).toBe(0);

    // توثيق إلزامي لكل تحوّل
    expect(
      await prisma.auditLog.count({ where: { action: "customer_merge", entityId: survivor.id } }),
    ).toBeGreaterThanOrEqual(1);
    const mergeRow = await prisma.customerMerge.findUniqueOrThrow({ where: { id: mergeId } });
    const manifest = mergeRow.idMap as unknown as {
      version: number;
      movedPhoneIds: string[];
      movedRelationIds: Record<string, string[]>;
    };
    expect(manifest.version).toBe(1);
    expect(manifest.movedRelationIds.orders).toEqual([orderId]);

    // بيانات بعد الدمج تُكتب على الـsurvivor وتبقى معه بعد الفصل
    const postMergeOrderId = await createOrder(tag, { customerId: survivor.id, wilayaCode });

    const { restoredCounts } = await unmergeCustomer({ mergedId: merged.id, actorId: adminId });
    expect(restoredCounts).toMatchObject({
      orders: 1,
      confirmationAttempts: 1,
      tasks: 1,
      communications: 1,
    });

    const [restoredOrder, postMergeOrder, mergedRow, restoredPhone] = await Promise.all([
      prisma.order.findUniqueOrThrow({ where: { id: orderId }, select: { customerId: true } }),
      prisma.order.findUniqueOrThrow({
        where: { id: postMergeOrderId },
        select: { customerId: true },
      }),
      prisma.customer.findUniqueOrThrow({
        where: { id: merged.id },
        select: { status: true, primaryPhone: true },
      }),
      prisma.customerPhone.findUniqueOrThrow({
        where: { phoneNormalized: merged.phone },
        select: { customerId: true, phoneType: true },
      }),
    ]);
    expect(restoredOrder.customerId).toBe(merged.id);
    expect(postMergeOrder.customerId).toBe(survivor.id); // لا يُستعاد ما لم يكن في المانيفست
    expect(mergedRow.status).toBe("active");
    expect(mergedRow.primaryPhone).toBe(merged.phone);
    expect(restoredPhone.customerId).toBe(merged.id);
    expect(restoredPhone.phoneType).toBe("primary");
    expect(
      await prisma.auditLog.count({ where: { action: "customer_unmerge", entityId: merged.id } }),
    ).toBe(1);

    // فصل مرتين → رفض حتمي بلا تغيير ثانٍ
    await expect(unmergeCustomer({ mergedId: merged.id, actorId: adminId })).rejects.toMatchObject({
      code: "ALREADY_RESTORED",
    });
  });

  // -------------------------------------------------------------------- 8
  it("تعارض أثناء الفصل (علاقة غادرت الـsurvivor) → UNMERGE_CONFLICT وإلغاء كامل", async () => {
    const survivor = await createCustomer(tag);
    const merged = await createCustomer(tag);
    const outsider = await createCustomer(tag);
    const movedOrderId = await createOrder(tag, { customerId: merged.id, wilayaCode });
    await prisma.task.create({
      data: { type: "follow_up", orderId: movedOrderId, customerId: merged.id, source: "manual" },
    });

    await mergeCustomers({ survivorId: survivor.id, mergedId: merged.id, actorId: adminId });

    // تغيّر ملكية بعد الدمج: الطلب لم يعد على الـsurvivor → استعادة أمينة مستحيلة
    await prisma.order.update({
      where: { id: movedOrderId },
      data: { customerId: outsider.id },
    });

    await expect(unmergeCustomer({ mergedId: merged.id, actorId: adminId })).rejects.toMatchObject({
      code: "UNMERGE_CONFLICT",
    });

    // إلغاء كامل: لا مهمة استُعيدت، والمدموج ما زال مؤرشفًا
    const task = await prisma.task.findFirstOrThrow({
      where: { orderId: movedOrderId },
      select: { customerId: true },
    });
    expect(task.customerId).toBe(survivor.id);
    const mergedRow = await prisma.customer.findUniqueOrThrow({
      where: { id: merged.id },
      select: { status: true },
    });
    expect(mergedRow.status).toBe("archived");
  });

  // -------------------------------------------------------------------- 4
  it("الهاتف الأساسي في اللقطة مفقود عند الفصل → UNMERGE_CONFLICT (فشل آمن)", async () => {
    const survivor = await createCustomer(tag);
    const merged = await createCustomer(tag);
    await mergeCustomers({ survivorId: survivor.id, mergedId: merged.id, actorId: adminId });

    // حذف صف الهاتف بعد الدمج — اللقطة لم تعد قابلة للاستعادة أمينًا
    await prisma.customerPhone.deleteMany({ where: { phoneNormalized: merged.phone } });

    await expect(unmergeCustomer({ mergedId: merged.id, actorId: adminId })).rejects.toMatchObject({
      code: "UNMERGE_CONFLICT",
    });
  });

  it("فصل عميل بلا سجل دمج → NO_MERGE_RECORD", async () => {
    const lone = await createCustomer(tag);
    await expect(unmergeCustomer({ mergedId: lone.id, actorId: adminId })).rejects.toMatchObject({
      code: "NO_MERGE_RECORD",
    });
  });

  it("نفس idempotencyKey مرتين → دمج واحد فقط (إعادة تشغيل آمنة)", async () => {
    const survivor = await createCustomer(tag);
    const merged = await createCustomer(tag);
    const key = `${tag}-idem-1`;

    const first = await mergeCustomers({
      survivorId: survivor.id,
      mergedId: merged.id,
      actorId: adminId,
      idempotencyKey: key,
    });
    const second = await mergeCustomers({
      survivorId: survivor.id,
      mergedId: merged.id,
      actorId: adminId,
      idempotencyKey: key,
    });

    expect(second.mergeId).toBe(first.mergeId);
    expect(await prisma.customerMerge.count({ where: { mergedId: merged.id } })).toBe(1);
  });
});
