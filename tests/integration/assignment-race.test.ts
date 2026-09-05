import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import {
  selfAssignOrder,
  recordConfirmationAttempt,
  AssignmentConflictError,
} from "@/server/modules/confirmation/confirmationService";

// اختبار تكامل سباق الإسناد الذاتي (تصحيح 39) + إعادة تشغيل محاولة التأكيد.
//
// يتطلب TEST_DATABASE_URL — قاعدة اختبار مخصصة فقط (محلية أو خدمة postgres في CI).
// عند غيابه تتخطى المجموعة كلها (describe.skip) بصوت واضح ولا يُفتح أي اتصال —
// لا سيناريو هنا يلمس قاعدة الإنتاج بحال. البيانات معزولة بمعرفات ثابتة خاصة
// بالاختبار وتُنظَّف قبل وبعد (deleteMany idempotent).

const AGENT_A_ID = "00000000-0000-4000-8000-0000000000aa";
const AGENT_B_ID = "00000000-0000-4000-8000-0000000000bb";
const ORDER_ID = "00000000-0000-4000-8000-0000000000cc";

async function cleanupTestRows() {
  await prisma.confirmationAttempt.deleteMany({ where: { orderId: ORDER_ID } });
  await prisma.idempotencyKey.deleteMany({ where: { actorId: { in: [AGENT_A_ID, AGENT_B_ID] } } });
  await prisma.order.deleteMany({ where: { id: ORDER_ID } });
  await prisma.adminUser.deleteMany({ where: { id: { in: [AGENT_A_ID, AGENT_B_ID] } } });
}

const maybeDescribe = process.env.TEST_DATABASE_URL ? describe : describe.skip;

maybeDescribe("سباق الإسناد الذاتي CAS (integration)", () => {
  let runStamp: string;

  beforeAll(() => {
    if (!process.env.TEST_DATABASE_URL) {
      console.warn(
        "[integration] TEST_DATABASE_URL غير مضبوط — تم تخطي اختبارات التكامل " +
          "(قاعدة اختبار مخصصة فقط؛ شغّلها محليًا أو في CI عبر .github/workflows/integration.yml).",
      );
    }
  });

  // تنظيف قبل الإنشاء وبعد الانتهاء — المعرفات ثابتة وخاصة بهذا الاختبار فلا
  // تمس أي بيانات أخرى، وdeleteMany آمن التكرار مهما فشلت تشغيلة سابقة في المنتصف
  beforeAll(cleanupTestRows);
  afterAll(cleanupTestRows);

  beforeAll(async () => {
    runStamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // ولاية مرجعية واحدة تكفي للـFK — الولايات تُزرع من prisma/seed.ts (upsert
    // idempotent) في CI قبل الاختبارات؛ غيابها خطأ تهيئة يُفشل الاختبار بصوت واضح.
    const wilaya = await prisma.wilaya.findFirst();
    if (!wilaya) {
      throw new Error("لا ولايات في قاعدة الاختبار — شغّل node --import tsx prisma/seed.ts أولًا");
    }

    await prisma.adminUser.createMany({
      data: [
        {
          id: AGENT_A_ID,
          authUserId: `it-race-auth-a-${runStamp}`,
          email: `it-race-a-${runStamp}@test.invalid`,
          fullName: "وكيل اختبار أ",
          role: "confirmation_agent",
        },
        {
          id: AGENT_B_ID,
          authUserId: `it-race-auth-b-${runStamp}`,
          email: `it-race-b-${runStamp}@test.invalid`,
          fullName: "وكيل اختبار ب",
          role: "confirmation_agent",
        },
      ],
    });

    await prisma.order.create({
      data: {
        id: ORDER_ID,
        orderNumber: `IT-RACE-${runStamp}`,
        customerFirstName: "سباق",
        customerLastName: "التكامل",
        phone: "0550000001",
        wilayaCode: wilaya.code,
        wilayaName: wilaya.name,
        commune: "اختبار",
        deliveryOption: "home",
        deliveryPriceDzd: 500,
        itemsSubtotalDzd: 1000,
        totalDzd: 1500,
        // إنتاجي عمدًا: الإسناد الذاتي وقائمة الانتظار يستثنيان isTest دائمًا
        isTest: false,
      },
    });
  });

  it("وكيلان متزامنان → فائز واحد فقط والخاسر AssignmentConflictError", async () => {
    const results = await Promise.allSettled([
      selfAssignOrder(ORDER_ID, AGENT_A_ID),
      selfAssignOrder(ORDER_ID, AGENT_B_ID),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(AssignmentConflictError);

    const winnerId = results[0].status === "fulfilled" ? AGENT_A_ID : AGENT_B_ID;
    const order = await prisma.order.findUnique({
      where: { id: ORDER_ID },
      select: { assignedAgentId: true },
    });
    expect(order?.assignedAgentId).toBe(winnerId);
  });

  it("نفس idempotencyKey مرتين → محاولة واحدة فقط في confirmation_attempts (replay)", async () => {
    const idempotencyKey = `it-race-attempt-${runStamp}`;
    const input = {
      orderId: ORDER_ID,
      outcome: "no_answer" as const,
      note: "اختبار إعادة التشغيل",
      idempotencyKey,
      actor: { type: "admin" as const, id: AGENT_A_ID },
    };

    // no_answer يُبقي الطلب pending (scheduleFollowUp) — لا انتقال آلة حالات
    const first = await recordConfirmationAttempt(input);
    const second = await recordConfirmationAttempt(input);

    expect(second.attemptId).toBe(first.attemptId);
    expect(first.orderStatusAfter).toBe("pending");
    expect(second.orderStatusAfter).toBe("pending");

    const attemptsCount = await prisma.confirmationAttempt.count({ where: { orderId: ORDER_ID } });
    expect(attemptsCount).toBe(1);
  });
});
