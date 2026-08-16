import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// استعملها داخل Server Components / Route Handlers / Server Actions.
// كل استدعاء يبني عميل جديد (لا تشاركه بين الطلبات).
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    // الإعداد الافتراضي لـ@supabase/ssr (httpOnly: false، بلا secure صريح) يجعل كوكيز
    // الجلسة قابلة للقراءة عبر JS — أي XSS مستقبلي يسرّب توكن الجلسة كاملاً. نفرض هنا
    // httpOnly/secure/sameSite صراحة بدل الاعتماد على افتراضيات الحزمة.
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components لا تقدر تكتب كوكيز — الـ middleware هو لي يحدث الجلسة فعليًا.
        }
      },
    },
  });
}
