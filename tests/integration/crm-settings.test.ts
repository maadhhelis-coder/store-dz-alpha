import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import {
  getAllCrmSettings,
  getCrmSetting,
  setCrmSetting,
} from "@/server/modules/settings/crmSettingsService";
import { computeRiskScore } from "@/server/modules/risk/riskDefinitions";
import { createAdmin, cleanupByTag, newTag, type FixtureTag } from "./support/customerFixtures";

// إعدادات CRM — الخدمة كانت كاملة وموثّقة وبلا أي مستدعٍ (لا مسار ولا شاشة)،
// فكانت كل عتبات P3/P4 "من crm_settings" اسمًا بينما لا سبيل لتغييرها فعليًا.
// هذه الاختبارات تثبت أن مسار الكتابة يعمل من طرف إلى طرف: يُتحقَّق، ويُحفظ،
// ويُوثَّق، ويؤثّر فعلًا في المحرك الذي يقرؤه.

const maybeDescribe = process.env.TEST_DATABASE_URL ? describe : describe.skip;

maybeDescribe("إعدادات CRM (integration)", () => {
  let tag: FixtureTag;
  let adminId: string;

  beforeAll(async () => {
    tag = newTag("cfg");
    adminId = await createAdmin(tag);
  });

  afterAll(async () => {
    await prisma.crmSetting.deleteMany({});
    await prisma.auditLog.deleteMany({ where: { entityType: "crm_setting" } });
    await cleanupByTag(tag);
  });

  it("بلا صف محفوظ: القراءة تعطي الافتراضيات الرسمية كاملة", async () => {
    await prisma.crmSetting.deleteMany({});
    const all = await getAllCrmSettings();
    expect(Object.keys(all).length).toBeGreaterThan(0);
    const thresholds = all.risk_thresholds as Record<string, number>;
    expect(thresholds).toMatchObject({ medium: 30, high: 55, very_high: 75 });
  });

  it("الكتابة تُحفظ وتُقرأ وتُوثَّق بقيمتها قبل وبعد", async () => {
    await setCrmSetting({
      key: "risk_thresholds",
      value: { medium: 35, high: 60, very_high: 80 },
      actorId: adminId,
      reason: "اختبار تكامل",
    });

    const stored = await getCrmSetting("risk_thresholds");
    expect(stored).toMatchObject({ medium: 35, high: 60, very_high: 80 });

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { entityType: "crm_setting", entityId: "risk_thresholds" },
      orderBy: { createdAt: "desc" },
      select: { action: true, actorId: true, before: true, after: true, reason: true },
    });
    expect(audit.action).toBe("settings");
    expect(audit.actorId).toBe(adminId);
    expect(audit.after).toMatchObject({ medium: 35 });
    expect(audit.reason).toBe("اختبار تكامل");
  });

  it("العتبة المحفوظة تغيّر تصنيف المخاطر فعليًا (الإعداد مقروء لا زينة)", async () => {
    const weights = await getCrmSetting("risk_weights");
    const factors = {
      refusalRate: 40,
      returnRate: 40,
      cancellationRate: 40,
      noAnswerRate: 40,
      duplicateOrders: 40,
      addressInconsistency: 40,
    };

    await setCrmSetting({
      key: "risk_thresholds",
      value: { medium: 30, high: 55, very_high: 75 },
      actorId: adminId,
    });
    const withDefaults = computeRiskScore({
      factors,
      weights,
      thresholds: await getCrmSetting("risk_thresholds"),
    });
    expect(withDefaults.score).toBe(40);
    expect(withDefaults.level).toBe("medium");

    // نُنزل العتبات فيصير نفس السكور مستوى أعلى — بلا تغيير سطر كود واحد
    await setCrmSetting({
      key: "risk_thresholds",
      value: { medium: 10, high: 20, very_high: 30 },
      actorId: adminId,
    });
    const withCustom = computeRiskScore({
      factors,
      weights,
      thresholds: await getCrmSetting("risk_thresholds"),
    });
    expect(withCustom.score).toBe(40);
    expect(withCustom.level).toBe("very_high");
  });

  it("قيمة تالفة تُرفض ولا تصل القاعدة (deny-by-default)", async () => {
    const before = await getCrmSetting("risk_thresholds");

    await expect(
      setCrmSetting({ key: "risk_thresholds", value: { medium: 0 }, actorId: adminId }),
    ).rejects.toThrow();
    await expect(
      setCrmSetting({ key: "segmentation_thresholds", value: { at_risk_days: 999 }, actorId: adminId }),
    ).rejects.toThrow();

    expect(await getCrmSetting("risk_thresholds")).toEqual(before);
  });

  it("مفتاح غير معروف مرفوض", async () => {
    await expect(
      setCrmSetting({
        key: "not_a_real_key" as never,
        value: {},
        actorId: adminId,
      }),
    ).rejects.toThrow();
  });
});
