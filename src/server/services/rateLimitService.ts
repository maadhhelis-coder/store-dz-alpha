import { Ratelimit, type Duration } from "@upstash/ratelimit";
import {
  redis,
  leadRateLimitByIp,
  loginRateLimitByIp,
  loginRateLimitByEmail,
  trackRateLimitByIp,
} from "@/lib/rateLimit/upstash";
import { getSiteSettings } from "@/server/services/siteSettingsService";

export type RateLimitResult = { allowed: true } | { allowed: false; reason: string };

// كل دوال هذا الملف تُستدعى أحيانًا قبل أي try/catch فمسارات الـAPI (checkout، تسجيل
// الدخول، leads) — عطل عابر فـUpstash Redis (أو فـقاعدة البيانات عند قراءة الإعدادات)
// كان سيرمي استثناءً غير مُعالَج فطلب العميل الأساسي بدل تجاهل حد المعدل بأمان. الفشل
// المفتوح هنا (السماح بالطلب بدل رفضه) مبدأ هذا المشروع نفسه: فحص خلفي واحد لا يجب أن
// يُسقط الإجراء الأساسي الذي يعتمد عليه.
// وسم منظَّم (event: "rate_limit_fail_open") بدل سطر نصي حر — راجع Deployment Audit HIGH-05:
// الفشل المفتوح كان صامتًا عمليًا (console.error عادي لا يميّزه أي نظام مراقبة خارجي عن أي
// خطأ آخر). هذا الشكل قابل للتصفية مباشرة عبر أي أداة تجميع سجلّات تعتمد على JSON (Vercel Log
// Drains، Datadog، إلخ) — يبقى تفعيل تنبيه فعلي (Slack/PagerDuty) مربوطًا بهذا الوسم مسؤولية
// تُضبَط خارج هذا الكود (لا بيانات اعتماد قناة تنبيه متوفرة هنا).
async function safeRateLimit(limiterName: string, check: () => Promise<RateLimitResult>): Promise<RateLimitResult> {
  try {
    return await check();
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "rate_limit_fail_open",
        limiter: limiterName,
        message: "rate limit backend unreachable — request ALLOWED with no throttling",
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      }),
    );
    return { allowed: true };
  }
}

// يبني محدِّدات المعدل حسب إعدادات صاحب المتجر الفعلية بدل قيم ثابتة بالكود — تبويب
// "الأمان" في لوحة التحكم كان يحفظ هذه القيم بلا أي تأثير فعلي على الطلبات الحقيقية.
export function checkOrderRateLimit(
  phone: string,
  ip: string,
  fullName: string,
  deviceFingerprint?: string,
): Promise<RateLimitResult> {
  return safeRateLimit("order", () => checkOrderRateLimitUnsafe(phone, ip, fullName, deviceFingerprint));
}

async function checkOrderRateLimitUnsafe(
  phone: string,
  ip: string,
  fullName: string,
  deviceFingerprint?: string,
): Promise<RateLimitResult> {
  const settings = await getSiteSettings();
  if (!settings.spamProtectionEnabled) return { allowed: true };

  const windowMinutes = Math.max(1, settings.orderLimitWindowMin);
  const window = `${windowMinutes} m` as Duration;
  const rateLimitByPhone = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(Math.max(1, settings.orderLimitPerPhone), window),
    prefix: "ratelimit:order:phone",
  });
  // نفضّل deviceFingerprint (معرّف الزائر الثابت من المتصفح) لأنه أدق من IP، الذي
  // يتشارك فيه عدة زوار على نفس الشبكة (4G مشترك، واي فاي عائلي...). IP يبقى احتياطًا
  // إذا لم يُرسل المتصفح معرّفًا (مثلاً جافاسكريبت معطّل).
  const rateLimitByDevice = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(Math.max(1, settings.orderLimitPerDevice), window),
    prefix: "ratelimit:order:device",
  });
  const rateLimitByName = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(Math.max(1, settings.orderLimitPerName), window),
    prefix: "ratelimit:order:name",
  });

  const [phoneResult, deviceResult, nameResult] = await Promise.all([
    rateLimitByPhone.limit(phone),
    rateLimitByDevice.limit(deviceFingerprint || ip),
    rateLimitByName.limit(fullName.trim().toLowerCase()),
  ]);

  if (!phoneResult.success) {
    return { allowed: false, reason: "لقد تجاوزت الحد المسموح من المحاولات لهذا الرقم، حاول لاحقًا" };
  }
  if (!deviceResult.success) {
    return { allowed: false, reason: "لقد تجاوزت الحد المسموح من المحاولات، حاول لاحقًا" };
  }
  if (!nameResult.success) {
    return { allowed: false, reason: "لقد تجاوزت الحد المسموح من المحاولات بهذا الاسم، حاول لاحقًا" };
  }

  return { allowed: true };
}

export function checkLeadRateLimit(ip: string): Promise<RateLimitResult> {
  return safeRateLimit("lead", () => checkLeadRateLimitUnsafe(ip));
}

async function checkLeadRateLimitUnsafe(ip: string): Promise<RateLimitResult> {
  const result = await leadRateLimitByIp.limit(ip);
  if (!result.success) {
    return { allowed: false, reason: "تم تجاوز الحد المسموح" };
  }
  return { allowed: true };
}

export function checkTrackRateLimit(ip: string): Promise<RateLimitResult> {
  return safeRateLimit("track", () => checkTrackRateLimitUnsafe(ip));
}

async function checkTrackRateLimitUnsafe(ip: string): Promise<RateLimitResult> {
  const result = await trackRateLimitByIp.limit(ip);
  if (!result.success) {
    return { allowed: false, reason: "تم تجاوز الحد المسموح" };
  }
  return { allowed: true };
}

export function checkLoginRateLimit(ip: string, email: string): Promise<RateLimitResult> {
  return safeRateLimit("login", () => checkLoginRateLimitUnsafe(ip, email));
}

async function checkLoginRateLimitUnsafe(ip: string, email: string): Promise<RateLimitResult> {
  const [ipResult, emailResult] = await Promise.all([
    loginRateLimitByIp.limit(ip),
    loginRateLimitByEmail.limit(email.trim().toLowerCase()),
  ]);

  if (!ipResult.success || !emailResult.success) {
    return { allowed: false, reason: "محاولات تسجيل دخول كثيرة، حاول مرة أخرى بعد قليل" };
  }
  return { allowed: true };
}
