import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { runJob } from "@/server/modules/jobs/jobRunner";
import { recomputeCustomerRisk, collectRiskFactors } from "@/server/modules/risk/riskService";
import { scanCustomerForFraud } from "@/server/modules/fraud/fraudService";
import { reviewFraudSignal, FraudSignalNotFoundError } from "@/server/modules/fraud/fraudQueries";
import { getCrmSetting } from "@/server/modules/settings/crmSettingsService";
import {
  cleanupByTag,
  createAdmin,
  createCustomer,
  createOrder,
  ensureWilayaCode,
  newTag,
  type FixtureTag,
} from "./support/customerFixtures";

// P4 على قاعدة حقيقية: job_runs والقفل والتزامن، كتابة المخاطر بالترتيب الصحيح،
// إشارات الاحتيال وأدلتها، وقيود القاعدة (severity، isTest، اليتامى).
// يتطلب TEST_DATABASE_URL — بدونه تُتخطى المجموعة كاملة بلا أي اتصال.

const maybeDescribe = process.env.TEST_DATABASE_URL ? describe : describe.skip;

maybeDescribe("P4 المخاطر والاحتيال (integration)", () => {
  let tag: FixtureTag;
  let adminId: string;
  let wilayaCode: number;

  beforeAll(async () => {
    tag = newTag("p4");
    wilayaCode = await ensureWilayaCode();
    adminId = await createAdmin(tag);
  });

  afterAll(async () => {
    await prisma.jobRun.deleteMany({ where: { job: { contains: tag } } });
    await prisma.systemAlert.deleteMany({ where: { message: { contains: tag } } });
    await cleanupByTag(tag);
  });

  // ------------------------------------------------------------ job_runs
  it("job ناجح يسجّل start/finish/duration في job_runs", async () => {
    const job = `${tag}-ok`;
    const outcome = await runJob(job, async () => ({ done: true }), { trigger: "test" });
    expect(outcome.status).toBe("completed");

    const row = await prisma.jobRun.findFirstOrThrow({ where: { job } });
    expect(row.status).toBe("success");
    expect(row.trigger).toBe("test");
    expect(row.startedAt).toBeInstanceOf(Date);
    expect(row.finishedAt).not.toBeNull();
    expect(row.durationMs).toBeGreaterThanOrEqual(0);
    expect(row.error).toBeNull();
  });

  it("job فاشل يسجّل error ويرفع SystemAlert ولا يُخفي الخطأ الأصلي", async () => {
    const job = `${tag}-fail`;
    const boom = new Error(`انفجار مقصود ${tag}`);
    await expect(runJob(job, async () => Promise.reject(boom), { trigger: "test" })).rejects.toBe(
      boom,
    );

    const row = await prisma.jobRun.findFirstOrThrow({ where: { job } });
    expect(row.status).toBe("failed");
    expect(row.error).toContain(tag);
    expect(row.finishedAt).not.toBeNull();
    expect(row.durationMs).toBeGreaterThanOrEqual(0);

    const alert = await prisma.systemAlert.findFirstOrThrow({
      where: { type: "job_failed", entityId: row.id },
    });
    expect(alert.severity).toBe("high");
    expect(alert.message).toContain(tag);
  });

  // ---------------------------------------------------------- concurrency
  it("تشغيلان متزامنان لنفس الـjob ⇒ تنفيذ واحد فقط والثاني مرفوض بالقفل", async () => {
    const job = `${tag}-race`;
    let executions = 0;
    const work = async () => {
      executions++;
      await new Promise((resolve) => setTimeout(resolve, 300));
      return executions;
    };

    const [a, b] = await Promise.all([runJob(job, work), runJob(job, work)]);
    expect([a.status, b.status].sort()).toEqual(["completed", "skipped_locked"]);
    expect(executions).toBe(1); // لا أثر مزدوج

    // المرفوض بالقفل لا يكتب صف تشغيل — لا تنفيذ = لا تشغيلة
    expect(await prisma.jobRun.count({ where: { job } })).toBe(1);
  });

  it("القفل يُحرَّر بعد الانتهاء فالتشغيل التالي يعمل", async () => {
    const job = `${tag}-sequential`;
    const first = await runJob(job, async () => 1);
    const second = await runJob(job, async () => 2);
    expect(first.status).toBe("completed");
    expect(second.status).toBe("completed");
    expect(await prisma.jobRun.count({ where: { job } })).toBe(2);
  });

  // --------------------------------------------------------------- risk
  it("حساب المخاطر يكتب score/level/factors/calculatedAt/engineVersion", async () => {
    const customer = await createCustomer(tag);
    for (let i = 0; i < 4; i++) {
      await createOrder(tag, {
        customerId: customer.id,
        wilayaCode,
        status: i < 3 ? "cancelled" : "pending",
      });
    }

    const result = await recomputeCustomerRisk(customer.id, adminId);
    const row = await prisma.customer.findUniqueOrThrow({
      where: { id: customer.id },
      select: {
        riskScore: true,
        riskLevel: true,
        riskFactors: true,
        riskCalculatedAt: true,
        riskEngineVersion: true,
      },
    });

    expect(row.riskScore).toBe(result.score);
    expect(row.riskLevel).toBe(result.level);
    expect(row.riskCalculatedAt).not.toBeNull();
    expect(row.riskEngineVersion).toBe("risk-v1");
    expect(Array.isArray(row.riskFactors)).toBe(true);
    expect((row.riskFactors as unknown[]).length).toBe(6);
    expect(row.riskScore).toBeGreaterThan(0); // 3 من 4 ملغاة ⇒ وزن الإلغاء يظهر

    expect(
      await prisma.auditLog.count({
        where: { action: "customer_risk_recomputed", entityId: customer.id },
      }),
    ).toBe(1);

    // إعادة التشغيل حتمية بلا أثر مزدوج (نفس القيم، ولا سجل تدقيق ثانٍ)
    const again = await recomputeCustomerRisk(customer.id, adminId);
    expect(again.score).toBe(result.score);
    expect(again.level).toBe(result.level);
    expect(
      await prisma.auditLog.count({
        where: { action: "customer_risk_recomputed", entityId: customer.id },
      }),
    ).toBe(1);
  });

  it("الطلبات التجريبية (isTest) لا تدخل حساب المخاطر إطلاقًا", async () => {
    const customer = await createCustomer(tag);
    await createOrder(tag, { customerId: customer.id, wilayaCode, status: "pending" });
    const before = await collectRiskFactors(customer.id);

    // المسار الوحيد المسموح: طلب تجريبي غير مرتبط بعميل (قيد القاعدة)
    await createOrder(tag, { customerId: null, wilayaCode, isTest: true, status: "cancelled" });
    const after = await collectRiskFactors(customer.id);
    expect(after).toEqual(before);
    expect(after.cancellationRate).toBe(0);
  });

  it("عميل بلا طلبات ⇒ كل العوامل صفر بلا قسمة على صفر", async () => {
    const customer = await createCustomer(tag);
    const factors = await collectRiskFactors(customer.id);
    expect(Object.values(factors).every((value) => value === 0)).toBe(true);

    const result = await recomputeCustomerRisk(customer.id);
    expect(result.score).toBe(0);
    expect(result.level).toBe("low");
  });

  // -------------------------------------------------------------- fraud
  it("إشارة high تفتح مهمة مراجعة واحدة فقط ولا تغيّر حالة أي طلب", async () => {
    const thresholds = await getCrmSetting("fraud_thresholds");
    const device = `dev-${tag}`;
    const owners: string[] = [];

    // عملاء متمايزون على نفس بصمة الجهاز حتى بلوغ العتبة
    for (let i = 0; i < thresholds.shared_device_min_customers; i++) {
      const customer = await createCustomer(tag);
      owners.push(customer.id);
      const orderId = await createOrder(tag, { customerId: customer.id, wilayaCode });
      await prisma.order.update({ where: { id: orderId }, data: { deviceFingerprint: device } });
    }
    const target = owners[0];
    const statusesBefore = await prisma.order.findMany({
      where: { customerId: target },
      select: { id: true, status: true },
      orderBy: { id: "asc" },
    });

    const scan = await scanCustomerForFraud(target, adminId);
    expect(scan.created.map((signal) => signal.signal)).toContain("shared_device");
    expect(scan.reviewTaskCreated).toBe(true);

    const signal = await prisma.fraudSignal.findFirstOrThrow({
      where: { customerId: target, signal: "shared_device" },
    });
    expect(signal.severity).toBe("high");
    expect(signal.status).toBe("open");
    expect(signal.evidence).not.toBeNull();
    expect(signal.engineVersion).toBe("fraud-v1");

    // لا تغيير لأي حالة طلب — Fraud Service لا يمس آلة الحالات
    const statusesAfter = await prisma.order.findMany({
      where: { customerId: target },
      select: { id: true, status: true },
      orderBy: { id: "asc" },
    });
    expect(statusesAfter).toEqual(statusesBefore);
    expect(
      await prisma.order.count({ where: { customerId: target, status: "fraud_suspected" } }),
    ).toBe(0);

    // إعادة التشغيل: لا إشارة مكررة ولا مهمة مراجعة ثانية
    const rescan = await scanCustomerForFraud(target, adminId);
    expect(rescan.created).toHaveLength(0);
    expect(rescan.reviewTaskCreated).toBe(false);
    expect(
      await prisma.fraudSignal.count({ where: { customerId: target, signal: "shared_device" } }),
    ).toBe(1);
    expect(await prisma.task.count({ where: { customerId: target, type: "manual_review" } })).toBe(
      1,
    );

    // المراجعة قرار بشري موثّق، ومراجعة مزدوجة مرفوضة حتميًا
    const reviewed = await reviewFraudSignal({
      signalId: signal.id,
      status: "dismissed",
      reason: "اختبار تكامل",
      actorId: adminId,
    });
    expect(reviewed.status).toBe("dismissed");
    await expect(
      reviewFraudSignal({
        signalId: signal.id,
        status: "reviewed",
        reason: "مرة ثانية",
        actorId: adminId,
      }),
    ).rejects.toBeInstanceOf(FraudSignalNotFoundError);
    expect(
      await prisma.auditLog.count({
        where: { action: "fraud_signal_reviewed", entityId: signal.id },
      }),
    ).toBe(1);
  });

  // ------------------------------------------------------- DB integrity
  it("قاعدة البيانات ترفض شدّة خارج low|medium|high", async () => {
    const customer = await createCustomer(tag);
    await expect(
      prisma.fraudSignal.create({
        data: {
          customerId: customer.id,
          signal: "manual_probe",
          severity: "critical",
          evidence: { probe: true },
          engineVersion: "test",
        },
      }),
    ).rejects.toThrow();
  });

  it("لا إشارات احتيال يتيمة في القاعدة", async () => {
    const orphans = await prisma.fraudSignal.count({
      where: { customerId: { not: null }, customer: null },
    });
    expect(orphans).toBe(0);
  });
});
