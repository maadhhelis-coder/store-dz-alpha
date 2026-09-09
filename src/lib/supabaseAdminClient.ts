import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// عميل بصلاحيات كاملة (service role) — يُستعمل من route handlers فقط بعد requireAdmin()،
// أبدًا لا يُصدَّر أو يُستعمل من كود يعمل فالمتصفح.
// إنشاء كسول (lazy) عمدًا: تفادي فشل خطوة البناء (build) قبل توفر متغيرات البيئة الحقيقية.
let client: SupabaseClient | undefined;

// خطأ مميَّز عن أي فشل آخر: نقص إعداد بيئة، لا عطل شبكة ولا ملف تالف. الفرق مهم
// لأن الرسالة المعروضة للمستخدم يجب أن تقوده لمكان الإصلاح الحقيقي (لوحة Vercel)
// بدل "حدث خطأ غير متوقع" الذي لا يدلّ على شيء.
export class SupabaseConfigError extends Error {}

export function getSupabaseAdmin(): SupabaseClient {
  if (!client) {
    // `!` السابقة كانت تكذب على TypeScript: عند غياب المفتاح فالإنتاج يرمي
    // createClient نصًا إنجليزيًا عامًا يُبتلع فـcatch الـroute ويصير 500 مبهمًا.
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const missing = [
      !url && "NEXT_PUBLIC_SUPABASE_URL",
      !key && "SUPABASE_SERVICE_ROLE_KEY",
    ].filter(Boolean);
    if (missing.length > 0) {
      throw new SupabaseConfigError(
        `رفع الملفات معطّل: متغيّر البيئة ${missing.join(" و")} غير مضبوط في بيئة التشغيل`,
      );
    }
    client = createClient(url!, key!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return client;
}

export const PRODUCT_IMAGES_BUCKET = "product-images";
