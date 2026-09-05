import { createHash } from "crypto";
import { prisma } from "@/server/db/prisma";
import { Prisma } from "@prisma/client";

// الـidempotency الدائم — PostgreSQL هو المرجع النهائي للصحة، وRedis مجرد
// تسريع (اختياري). الضمانة النهائية: UNIQUE(actor_id, operation, idempotency_key).
//
// العقد (Corrections 3.4/62):
// - نفس (actor+operation+key) ونفس requestHash -> تُرجَع النتيجة الأصلية.
// - نفس المفتاح بـhash مختلف -> IdempotencyKeyReusedError (409 حتمي).
// - طلبان متطابقان متزامنان -> mutation واحد فقط ينفَّذ.
// - تعطّل Redis لا يمسّ الصحة أبدًا (هنا لا نعتمده أساسًا).
// - الاستبقاء محدود بـexpiresAt، والتنظيف الدوري عبر cron (P7).
// - سجل claimed انتهت صلاحيته (عامل انهار قبل الإكمال) -> يُستعاد بأمان.

export class IdempotencyKeyReusedError extends Error {
  readonly code = "IDEMPOTENCY_KEY_REUSED";

  constructor() {
    super("تم استعمال مفتاح idempotency نفسه بطلب مختلف");
    this.name = "IdempotencyKeyReusedError";
  }
}

export class IdempotencyInFlightError extends Error {
  readonly code = "IDEMPOTENCY_IN_FLIGHT";

  constructor() {
    super("طلب بنفس المفتاح قيد التنفيذ حاليًا — أعد المحاولة لاحقًا");
    this.name = "IdempotencyInFlightError";
  }
}

export type IdempotentExecutionResult<T> =
  | { kind: "executed"; value: T }
  | { kind: "replayed"; value: T };

/** hash حتمي للحمولة — أي فرق في المحتوى ينتج hash مختلفًا (ترتيب مفاتيح مستقر). */
export function hashIdempotentRequest(operation: string, payload: unknown): string {
  return createHash("sha256").update(operation).update(" ").update(stableStringify(payload)).digest("hex");
}

// ترتيب مفاتيح مستقر — JSON.stringify العادي يعتمد ترتيب الإدراج
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

export type IdempotentOptions<T> = {
  actorId: string;
  operation: string;
  idempotencyKey: string;
  /** حمولة الطلب كما وصلت — تُحسب منها بصمة الطلب الحتمية. */
  payload: unknown;
  /** مدة الاحتفاظ بالنتيجة بالثواني (افتراضي 24 ساعة — استبقاء محدود موثّق). */
  retentionSeconds?: number;
  /** تحويل النتيجة إلى JSON للتخزين (الافتراضي: القيمة كما هي). */
  serialize?: (value: T) => Prisma.InputJsonValue;
  /** إعادة بناء النتيجة من JSON المخزَّن (الافتراضي: JSON كما هو). */
  deserialize?: (json: Prisma.JsonValue) => T;
};

const DEFAULT_RETENTION_SECONDS = 24 * 60 * 60;
const CLAIM_GRACE_SECONDS = 10 * 60; // مهلة إضافية قبل اعتبار claim معلقًا قابلاً للاستعادة

/**
 * تنفيذ مع حماية idempotency دائمة:
 * 1. حاول حجز المفتاح (INSERT .. ON CONFLICT DO NOTHING).
 * 2. الحجز نجح -> نفّذ؛ نجاح: خزّن النتيجة وأكمل؛ فشل: حرّر المفتاح (العميل يعيد).
 * 3. الحجز خالف فريدًا -> اقرأ السجل الموجود:
 *    - hash مختلف -> IDEMPOTENCY_KEY_REUSED (لا تفسير ولا دمج).
 *    - completed -> أعد تشغيل النتيجة المخزنة.
 *    - claimed ولم تنته صلاحيته -> قيد التنفيذ (409 لطيف للعميل).
 *    - claimed منتهي الصلاحية -> استعادة CAS (عامل سابق انهار).
 */
export async function executeIdempotent<T>(
  options: IdempotentOptions<T>,
  execute: () => Promise<T>,
): Promise<IdempotentExecutionResult<T>> {
  const requestHash = hashIdempotentRequest(options.operation, options.payload);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + (options.retentionSeconds ?? DEFAULT_RETENTION_SECONDS) * 1000);

  const claimed = await prisma.idempotencyKey
    .create({
      data: {
        actorId: options.actorId,
        operation: options.operation,
        idempotencyKey: options.idempotencyKey,
        requestHash,
        status: "claimed",
        expiresAt,
      },
    })
    .catch(() => null);

  if (claimed) {
    try {
      const value = await execute();
      await prisma.idempotencyKey.update({
        where: { id: claimed.id },
        data: {
          status: "completed",
          result: (options.serialize ? options.serialize(value) : (value as Prisma.InputJsonValue)) ?? Prisma.JsonNull,
        },
      });
      return { kind: "executed", value };
    } catch (error) {
      // فشل التنفيذ يحرر المفتاح — إعادة المحاولة بنفس المفتاح مشروعة
      await prisma.idempotencyKey.delete({ where: { id: claimed.id } }).catch(() => {});
      throw error;
    }
  }

  // فشل الحجز: سجل موجود — فرّق بين إعادة تشغيل/تعارض/قيد تنفيذ/استعادة
  const existing = await prisma.idempotencyKey.findUnique({
    where: {
      actorId_operation_idempotencyKey: {
        actorId: options.actorId,
        operation: options.operation,
        idempotencyKey: options.idempotencyKey,
      },
    },
  });

  if (!existing) {
    // حالة نادرة (سجل حُذف بين المحاولتين) — أعد المحاولة مرة واحدة
    return executeIdempotent(options, execute);
  }

  if (existing.requestHash !== requestHash) {
    throw new IdempotencyKeyReusedError();
  }

  if (existing.status === "completed") {
    if (!existing.result) {
      // نتيجة فُقدت نظريًا (يجب ألا يحدث) — عاملها كقيد تنفيذ لتجنب mutation مزدوج
      throw new IdempotencyInFlightError();
    }
    const value = options.deserialize
      ? options.deserialize(existing.result)
      : (existing.result as unknown as T);
    return { kind: "replayed", value };
  }

  // claimed: هل انتهت صلاحيته (عامل انهار)؟ استعادة CAS — فائز واحد فقط
  const reclaimDeadline = new Date(now.getTime() - CLAIM_GRACE_SECONDS * 1000);
  const reclaimed = await prisma.idempotencyKey.updateMany({
    where: { id: existing.id, status: "claimed", expiresAt: { lt: reclaimDeadline } },
    data: { expiresAt },
  });

  if (reclaimed.count === 1) {
    try {
      const value = await execute();
      await prisma.idempotencyKey.update({
        where: { id: existing.id },
        data: {
          status: "completed",
          result: (options.serialize ? options.serialize(value) : (value as Prisma.InputJsonValue)) ?? Prisma.JsonNull,
        },
      });
      return { kind: "executed", value };
    } catch (error) {
      await prisma.idempotencyKey.delete({ where: { id: existing.id } }).catch(() => {});
      throw error;
    }
  }

  throw new IdempotencyInFlightError();
}

/** تنظيف دوري للمفاتيح المنتهية — cron (P7) يستدعيها. */
export async function cleanupExpiredIdempotencyKeys(): Promise<number> {
  const result = await prisma.idempotencyKey.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return result.count;
}
