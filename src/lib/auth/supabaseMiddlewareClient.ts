import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// يشغّلها middleware.ts فكل طلب: يجدد الجلسة (session) ويكتب الكوكيز المحدثة
// على الاستجابة، ويرجع { response, user } باش الـ middleware يقرر واش يسمح بالدخول.
//
// requestHeaders: هيدرز الطلب المُعدَّلة من middleware.ts (تحمل x-nonce وCSP الخاصة
// بهذا الطلب تحديدًا) — يجب استعمالها هنا بدل request الخام حتى لا يُفقَد nonce الصحيح
// عند إعادة بناء NextResponse.next() داخليًا (خصوصًا داخل setAll التي تُعيد بناءه مرة ثانية).
export async function updateSupabaseSession(request: NextRequest, requestHeaders: Headers) {
  let response = NextResponse.next({ request: { headers: requestHeaders } });
  let user = null;

  // فشل تكوين Supabase (رابط/مفتاح فارغ أو غير صالح) أو انقطاع خدمة Supabase Auth نفسها
  // يجب أن يُعامَل كـ"لا جلسة" (401/إعادة توجيه لتسجيل الدخول) وليس تعطّل الطلب بالكامل
  // بخطأ 500 غير معالَج — هذا هو نفس مبدأ "fail closed" المتبع فطبقة requireAdmin كدفاع
  // إضافي، لكنه هنا فالطبقة الأولى (middleware) حيث يظهر التعطّل فعليًا لأي طلب إداري.
  // اكتُشف فعليًا: تشغيلة CI حقيقية بدون أسرار Supabase (بعد حذفها عمدًا — Deployment
  // Audit CRIT-01) أرجعت 500 على مسار محمي بدل 401 المتوقَّع — لأن createServerClient()
  // نفسه كان يُستدعى خارج try/catch فمحاولة سابقة، فرمى استثناءً غير مُعالَج قبل حتى
  // الوصول لـauth.getUser() (الذي كان الوحيد المُغطّى وقتها).
  try {
    const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      // نفس السبب فـsupabaseServerClient.ts — بلا هذا، كوكيز الجلسة تُكتب بـhttpOnly:false
      // افتراضيًا من الحزمة نفسها.
      cookieOptions: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
      },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request: { headers: requestHeaders } });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
          for (const [key, val] of Object.entries(headers)) {
            response.headers.set(key, val);
          }
        },
      },
    });

    const result = await supabase.auth.getUser();
    user = result.data.user;
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "auth_check_failed",
        layer: "middleware",
        message: "Supabase auth client failed — treating request as unauthenticated",
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      }),
    );
  }

  return { response, user };
}
