import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// حد التقاط العملاء المحتملين حسب عنوان IP: 10 كل 10 دقائق (أوسع من الطلبات لأنه يُرسل تلقائيًا)
export const leadRateLimitByIp = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "10 m"),
  prefix: "ratelimit:lead:ip",
});

// نقطتا /api/track/pageview و/api/track/creative-event بلا مصادقة وتكتبان فـقاعدة البيانات
// مباشرة على كل استدعاء — بلا هذا الحد، سكربت واحد قادر على إغراق الجداول (تكلفة تخزين)
// وتسميم أرقام التحليلات (CTR، الأداء) التي يعتمد عليها صاحب المتجر لقرارات إعلانية حقيقية.
// السقف سخي عمدًا (60 كل 5 دقائق) — يغطي تصفّح حقيقي عادي بارتياح، ويردع الإغراق الآلي فقط.
export const trackRateLimitByIp = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, "5 m"),
  prefix: "ratelimit:track:ip",
});

// ملاحظة: محدِّدات الطلبات (هاتف/IP/اسم) لم تعد ثابتة هنا — تُبنى ديناميكيًا في
// rateLimitService.checkOrderRateLimit من إعدادات SiteSettings الفعلية التي يضبطها
// صاحب المتجر من لوحة التحكم (تبويب الأمان)، بدل قيم مبرمجة بالكود لا تتأثر بأي تعديل.

// حد محاولات تسجيل دخول الأدمن — 5 محاولات كل 15 دقيقة لكل IP ولكل بريد إلكتروني، لمنع
// هجوم Brute Force على الحساب الذي يتحكم بكل شيء في المتجر.
export const loginRateLimitByIp = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "15 m"),
  prefix: "ratelimit:login:ip",
});

export const loginRateLimitByEmail = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "15 m"),
  prefix: "ratelimit:login:email",
});
