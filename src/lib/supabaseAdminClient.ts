import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// عميل بصلاحيات كاملة (service role) — يُستعمل من route handlers فقط بعد requireAdmin()،
// أبدًا لا يُصدَّر أو يُستعمل من كود يعمل فالمتصفح.
// إنشاء كسول (lazy) عمدًا: تفادي فشل خطوة البناء (build) قبل توفر متغيرات البيئة الحقيقية.
let client: SupabaseClient | undefined;

export function getSupabaseAdmin(): SupabaseClient {
  if (!client) {
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
  }
  return client;
}

export const PRODUCT_IMAGES_BUCKET = "product-images";
