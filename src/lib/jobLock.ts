import { randomUUID } from "crypto";
import { redis } from "@/lib/rateLimit/upstash";

// قفل مهمة واحد على مستوى المشروع — SET NX EX على Upstash.
// الغرض الوحيد: منع تشغيلين متزامنين لنفس الـjob (عدة نسخ serverless أو
// استدعاء cron مكرر). المهلة تضمن التحرر التلقائي لو انهار العامل.
//
// ponytail: قفل عام لكل job بمهلة ثابتة — يكفي لمهمة cron واحدة كل ساعة.
// لو صارت المهام متوازية على أجزاء (per-shard) فالترقية: مفتاح لكل جزء.

export type JobLock = { key: string; token: string };

export async function acquireJobLock(job: string, ttlSeconds: number): Promise<JobLock | null> {
  const key = `joblock:${job}`;
  const token = randomUUID();
  // NX: لا يكتب إن وُجد المفتاح — الفائز واحد حتمًا. EX: تحرر تلقائي عند الانهيار.
  const acquired = await redis.set(key, token, { nx: true, ex: ttlSeconds });
  return acquired === "OK" ? { key, token } : null;
}

/** تحرير مالكه فقط — قفل انتهت مهلته وأُعيد أخذه من عامل آخر لا يُحرَّر هنا. */
export async function releaseJobLock(lock: JobLock): Promise<boolean> {
  const current = await redis.get<string>(lock.key);
  if (current !== lock.token) return false;
  await redis.del(lock.key);
  return true;
}
