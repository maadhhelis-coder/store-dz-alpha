import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { Ratelimit } from "@upstash/ratelimit";
import { redis } from "@/lib/rateLimit/upstash";
import { getClientIp } from "@/lib/getClientIp";
import { validateCoupon, InvalidCouponError } from "@/server/services/couponsService";
import { isE2ETestRun } from "@/lib/e2eGuard";

// حد بسيط ضد تخمين أكواد الكوبونات (brute-force) — يسمح بمحاولات كافية لتصحيح خطأ كتابة
// بشري عادي بدون فتح الباب لفحص آلاف الأكواد.
//
// أثناء E2E: بدل رفع السقف لرقم أعلى (200 سابقًا)، نُفتاح المحدِّد بمعرِّف عشوائي لعملية
// الخادم نفسها بدل IP الحقيقي المشترك. راجع اكتشاف فعلي أوسع من الأول: رفع السقف لـ200 كان
// كافيًا لتشغيلة CI واحدة، لكن Upstash يحتفظ بحالة المحدِّد فـRedis الحقيقي **عبر تشغيلات CI
// مختلفة** (وليس فقط داخل التشغيلة الواحدة) — وتراكم عشرات تشغيلات E2E المتكررة فنفس الجلسة
// (كل تشغيلة على عامل CI جديد لكن قد يتشارك نطاق IP قريبًا مع تشغيلات سابقة) أعاد استنفاد
// حتى السقف المرفوع، فأخفق حتى chromium-desktop الذي كان ينجح دومًا سابقًا. معرِّف عشوائي
// جديد لكل بدء خادم (توليد وحيد وقت تحميل الوحدة، مستقر طوال عمر العملية) يضمن أن كل تشغيلة
// CI طازجة تبدأ بحصة فارغة تمامًا، بلا أي أثر متراكم من أي تشغيلة سابقة مهما تكرّرت. الاختبار
// المتعمَّد (rate-limit-429.spec.ts، 202 طلب) يبقى يعمل بلا تغيير — كل طلباته داخل نفس عملية
// الخادم تتشارك نفس المعرِّف العشوائي، فيبقى قادرًا على استنفاد حصته الخاصة فعليًا ويثبت 429.
const couponValidateRateLimitKey = isE2ETestRun() ? `e2e-${randomUUID()}` : null;

const couponValidateRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(15, "10 m"),
  prefix: "ratelimit:coupon:validate",
});

const bodySchema = z.object({
  code: z.string().trim().min(1).max(40),
  subtotalDzd: z.number().int().min(0),
});

// عام (بلا مصادقة) — للتحقق الفوري من كود الخصم في نموذج الطلب قبل الإرسال. لا يزيد
// عداد الاستخدام (usedCount) هنا، فقط يتحقق ويرجع قيمة الخصم إن كان صالحًا.
export async function POST(request: Request) {
  const ip = couponValidateRateLimitKey ?? getClientIp(request);
  // فشل مفتوح: عطل عابر بـ Upstash Redis لا يجب أن يمنع التحقق من كوبون صالح فعليًا —
  // نفس مبدأ safeRateLimit فـ rateLimitService.ts، لكن هذا المحدِّد محلي لهذا المسار فقط.
  try {
    const rateLimit = await couponValidateRateLimit.limit(ip);
    if (!rateLimit.success) {
      return NextResponse.json({ error: "محاولات كثيرة، حاول لاحقًا" }, { status: 429 });
    }
  } catch (error) {
    console.error("coupon rate limit check failed, failing open", error);
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "بيانات غير صحيحة" }, { status: 400 });
  }

  try {
    const { discountDzd } = await validateCoupon(parsed.data.code, parsed.data.subtotalDzd);
    return NextResponse.json({ valid: true, discountDzd });
  } catch (error) {
    if (error instanceof InvalidCouponError) {
      // 200 وليس 400: الطلب نفسه صحيح ومُعالَج بنجاح تمامًا — "الكود غير صالح" نتيجة تجارية
      // (لا يوجد الكود، منتهي الصلاحية، لا يبلغ الحد الأدنى...) وليست خطأ فصياغة الطلب.
      // 400 هنا كانت تخلط دلالة HTTP بعلم valid داخل الجسم لنفس المعنى بلا داعٍ.
      return NextResponse.json({ valid: false, error: error.message }, { status: 200 });
    }
    console.error("coupon validate error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}
