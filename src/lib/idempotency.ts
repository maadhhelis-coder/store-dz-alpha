import { redis } from "@/lib/rateLimit/upstash";

const CLAIM_TTL_SECONDS = 120; // نافذة معالجة معقولة لطلب واحد قبل اعتباره عالقًا
const RESULT_TTL_SECONDS = 60 * 60 * 24; // يوم كامل — يغطي أي إعادة محاولة معقولة من عميل بشري
const PROCESSING_MARKER = "__processing__";

export type IdempotentResult<T> = { status: number; body: T };

export class IdempotencyConflictError extends Error {
  constructor() {
    super("طلب مطابق قيد المعالجة حاليًا، حاول بعد لحظات");
    this.name = "IdempotencyConflictError";
  }
}

// يضمن أن نفس Idempotency-Key لا يُنفَّذ فعليًا سوى مرة واحدة: أول طلب بمفتاح معيّن
// يحجز المفتاح فوريًا (SET NX) وينفّذ العملية الحقيقية، وأي طلب لاحق بنفس المفتاح —
// سواء إعادة محاولة حقيقية بعد انقطاع شبكة أو نقرة مزدوجة تجاوزت تعطيل الزر بالواجهة —
// يستلم نتيجة الطلب الأول المخزَّنة بدل تكرار العملية (خصم مخزون، إنشاء طلب) من جديد.
export async function withIdempotency<T>(
  key: string,
  handler: () => Promise<IdempotentResult<T>>,
): Promise<IdempotentResult<T>> {
  const redisKey = `idempotency:${key}`;
  const claimed = await redis.set(redisKey, PROCESSING_MARKER, { nx: true, ex: CLAIM_TTL_SECONDS });

  if (claimed !== "OK") {
    const existing = await redis.get<IdempotentResult<T> | typeof PROCESSING_MARKER>(redisKey);
    if (!existing || existing === PROCESSING_MARKER) {
      // مفتاح محجوز حاليًا من طلب متزامن حقيقي لم يكتمل بعد — وليس نتيجة مخزَّنة جاهزة.
      throw new IdempotencyConflictError();
    }
    return existing;
  }

  let result: IdempotentResult<T>;
  try {
    result = await handler();
  } catch (error) {
    // فشل غير متوقع أثناء التنفيذ — نُحرِّر المفتاح فورًا بدل تركه محجوزًا حتى انتهاء
    // صلاحيته، ليتمكن العميل من إعادة المحاولة بنفس المفتاح مباشرة.
    await redis.del(redisKey);
    throw error;
  }

  // نُخزّن النتيجة فقط إذا كانت نجاحًا فعليًا (2xx). فشل تجاري متوقَّع (نفاد مخزون، كوبون
  // غير صالح...) يُحرَّر بدل تخزينه — وإلا يُحبَس العميل بنفس رسالة الخطأ للأبد حتى لو
  // صحَّح البيانات (مثلًا قلَّل الكمية) وأعاد المحاولة بنفس المفتاح.
  if (result.status >= 200 && result.status < 300) {
    await redis.set(redisKey, result, { ex: RESULT_TTL_SECONDS });
  } else {
    await redis.del(redisKey);
  }

  return result;
}
