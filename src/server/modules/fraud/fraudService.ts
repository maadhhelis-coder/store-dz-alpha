import { prisma } from "@/server/db/prisma";
import { getCrmSetting } from "@/server/modules/settings/crmSettingsService";
import { createTask } from "@/server/modules/tasks/tasksService";
import { writeAudit } from "@/server/services/auditService";
import { redactForAudit } from "@/lib/redact";
import type { Prisma } from "@prisma/client";

// ===========================================================================
// Fraud Service — كشف الإشارات وتوثيق الأدلة (P4)
// ===========================================================================
// قواعد مقفلة من الـBlueprint:
// - لا تغيير لحالة أي طلب هنا إطلاقًا. fraud_suspected حالة يقررها إنسان عبر
//   آلة الحالات الموحّدة؛ الخدمة تفتح مهمة manual_review فقط ولا شيء غيرها.
// - severity محصورة في low|medium|high (قيد CHECK في القاعدة يرفض غيرها).
// - كل إشارة تحمل evidence غير فارغ ومنقّح (redactForAudit) — الدليل جزء من
//   الإشارة لا ملحق اختياري.
// - idempotent: إشارة مفتوحة من نفس النوع لنفس العميل لا تُكرَّر، ومهمة
//   المراجعة لا تُفتح مرتين لنفس الحالة.
// - isTest مستثنى من كل استعلام.

export const FRAUD_ENGINE_VERSION = "fraud-v1";

/** أنواع الإشارات وشدّتها — تصنيف ثابت بطبيعة القاعدة لا رقم تشغيلي قابل للضبط.
 * العتبات العددية وحدها تعيش في crm_settings.fraud_thresholds. */
export const FRAUD_SIGNALS = {
  shared_device: "high",
  shared_ip: "medium",
  repeat_refusal: "medium",
} as const satisfies Record<string, "low" | "medium" | "high">;

export type FraudSignalKind = keyof typeof FRAUD_SIGNALS;

export type DetectedSignal = {
  signal: FraudSignalKind;
  severity: (typeof FRAUD_SIGNALS)[FraudSignalKind];
  evidence: Record<string, unknown>;
};

const PRODUCTION_ORDERS: Prisma.OrderWhereInput = { isTest: false };

/** الكشف الصرف على بيانات مجلوبة — قابل للاختبار بلا قاعدة بيانات. */
export function detectSignals(input: {
  sharedDeviceCustomers: number;
  sharedIpCustomers: number;
  refusedOrders: number;
  thresholds: {
    shared_device_min_customers: number;
    shared_ip_min_customers: number;
    repeat_refusal_min_orders: number;
  };
  evidenceContext: Record<string, unknown>;
}): DetectedSignal[] {
  const t = input.thresholds;
  for (const [key, value] of Object.entries(t)) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 1) {
      throw new FraudConfigError(`عتبة احتيال غير صالحة (${key})`);
    }
  }

  const signals: DetectedSignal[] = [];

  if (input.sharedDeviceCustomers >= t.shared_device_min_customers) {
    signals.push({
      signal: "shared_device",
      severity: FRAUD_SIGNALS.shared_device,
      evidence: {
        ...input.evidenceContext,
        rule: "shared_device",
        distinctCustomersOnDevice: input.sharedDeviceCustomers,
        threshold: t.shared_device_min_customers,
      },
    });
  }

  if (input.sharedIpCustomers >= t.shared_ip_min_customers) {
    signals.push({
      signal: "shared_ip",
      severity: FRAUD_SIGNALS.shared_ip,
      evidence: {
        ...input.evidenceContext,
        rule: "shared_ip",
        distinctCustomersOnIp: input.sharedIpCustomers,
        threshold: t.shared_ip_min_customers,
      },
    });
  }

  if (input.refusedOrders >= t.repeat_refusal_min_orders) {
    signals.push({
      signal: "repeat_refusal",
      severity: FRAUD_SIGNALS.repeat_refusal,
      evidence: {
        ...input.evidenceContext,
        rule: "repeat_refusal",
        refusedOrders: input.refusedOrders,
        threshold: t.repeat_refusal_min_orders,
      },
    });
  }

  return signals;
}

export class FraudConfigError extends Error {
  readonly code = "FRAUD_CONFIG_INVALID";

  constructor(message: string) {
    super(message);
    this.name = "FraudConfigError";
  }
}

/** فحص عميل واحد: يجلب الأدلة، يكشف، ثم يكتب ما هو جديد فقط. */
export async function scanCustomerForFraud(
  customerId: string,
  actorId?: string | null,
): Promise<{ created: DetectedSignal[]; skippedExisting: number; reviewTaskCreated: boolean }> {
  const thresholds = await getCrmSetting("fraud_thresholds");

  const orders = await prisma.order.findMany({
    where: { customerId, ...PRODUCTION_ORDERS },
    select: { status: true, deviceFingerprint: true, ipAddress: true },
  });

  const devices = [...new Set(orders.map((o) => o.deviceFingerprint).filter(Boolean))] as string[];
  const ips = [...new Set(orders.map((o) => o.ipAddress).filter(Boolean))] as string[];

  // أكبر عدد عملاء متمايزين يشترك على أي جهاز/IP يخص هذا العميل
  const [sharedDeviceCustomers, sharedIpCustomers] = await Promise.all([
    maxDistinctCustomers({ deviceFingerprint: { in: devices } }, devices.length),
    maxDistinctCustomers({ ipAddress: { in: ips } }, ips.length),
  ]);

  const signals = detectSignals({
    sharedDeviceCustomers,
    sharedIpCustomers,
    refusedOrders: orders.filter((o) => o.status === "return_to_origin").length,
    thresholds,
    evidenceContext: { customerId, engineVersion: FRAUD_ENGINE_VERSION },
  });

  const existing = await prisma.fraudSignal.findMany({
    where: { customerId, status: "open", signal: { in: signals.map((s) => s.signal) } },
    select: { signal: true },
  });
  const openKinds = new Set(existing.map((e) => e.signal));
  const fresh = signals.filter((s) => !openKinds.has(s.signal));

  for (const signal of fresh) {
    await prisma.fraudSignal.create({
      data: {
        customerId,
        signal: signal.signal,
        severity: signal.severity,
        evidence: redactForAudit(signal.evidence) as Prisma.InputJsonValue,
        engineVersion: FRAUD_ENGINE_VERSION,
      },
    });
    await writeAudit({
      actorType: actorId ? "admin" : "system",
      actorId: actorId ?? null,
      action: "fraud_signal_raised",
      entityType: "customer",
      entityId: customerId,
      after: { signal: signal.signal, severity: signal.severity, evidence: signal.evidence },
    });
  }

  // high ⇒ مراجعة يدوية فقط (ولا شيء آخر): لا حظر، ولا تغيير حالة طلب.
  // مهمة واحدة كحد أقصى لنفس العميل ما دامت مفتوحة — لا تكرار عند إعادة التشغيل.
  const hasHigh = fresh.some((s) => s.severity === "high");
  let reviewTaskCreated = false;
  if (hasHigh) {
    const openReview = await prisma.task.count({
      where: { customerId, type: "manual_review", status: { in: ["open", "in_progress"] } },
    });
    if (openReview === 0) {
      await createTask({
        type: "manual_review",
        customerId,
        priority: "high",
        source: "automation",
        createdById: actorId ?? null,
        payload: {
          kind: "fraud_review",
          signals: fresh.filter((s) => s.severity === "high").map((s) => s.signal),
          engineVersion: FRAUD_ENGINE_VERSION,
        },
      });
      reviewTaskCreated = true;
    }
  }

  return { created: fresh, skippedExisting: signals.length - fresh.length, reviewTaskCreated };
}

/** أعلى عدد عملاء متمايزين على أي قيمة ضمن المجموعة — استعلام تجميعي واحد. */
async function maxDistinctCustomers(
  where: Prisma.OrderWhereInput,
  candidateCount: number,
): Promise<number> {
  if (candidateCount === 0) return 0;
  const rows = await prisma.order.findMany({
    where: { ...where, ...PRODUCTION_ORDERS, customerId: { not: null } },
    select: { customerId: true, deviceFingerprint: true, ipAddress: true },
  });
  const byKey = new Map<string, Set<string>>();
  for (const row of rows) {
    for (const key of [row.deviceFingerprint, row.ipAddress]) {
      if (!key || !row.customerId) continue;
      const set = byKey.get(key) ?? new Set<string>();
      set.add(row.customerId);
      byKey.set(key, set);
    }
  }
  return Math.max(0, ...[...byKey.values()].map((s) => s.size));
}
