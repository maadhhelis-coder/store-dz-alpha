import { NextResponse } from "next/server";
import { z } from "zod";
import { Ratelimit } from "@upstash/ratelimit";
import { redis } from "@/lib/rateLimit/upstash";
import { getClientIp } from "@/lib/getClientIp";
import { validateCoupon, InvalidCouponError } from "@/server/services/couponsService";

// حد بسيط ضد تخمين أكواد الكوبونات (brute-force) — يسمح بمحاولات كافية لتصحيح خطأ كتابة
// بشري عادي بدون فتح الباب لفحص آلاف الأكواد.
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
  const ip = getClientIp(request);
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
