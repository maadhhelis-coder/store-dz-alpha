-- اكتُشف على الإنتاج (تنبيه Supabase Security Advisor + إثبات فعلي بمفتاح anon العلني):
-- مفتاح anon موجود في حزمة جافاسكريبت للموقع (NEXT_PUBLIC_)، وPostgREST يكشف كل جداول
-- schema "public" مباشرةً. بلا RLS كان أي شخص يقدر يقرأ ويكتب ويحذف كل شيء عبر
-- /rest/v1/<table> — أُثبت فعليًا: admin_users وapi_keys وsite_settings وproducts رجعوا 200
-- ببيانات حقيقية. (الطلبات والزبائن كانوا فارغين وقتها فقط، لا حماية.)
--
-- الإصلاح: تفعيل RLS بلا أي policy على كل جداول public = رفض كامل لأدوار anon/authenticated.
-- التطبيق نفسه غير متأثر إطلاقًا: Prisma يتصل بدور postgres (rolbypassrls = true) وهو أيضًا
-- مالك الجداول، وSupabase يُستعمل هنا للمصادقة والتخزين فقط (auth/storage) ولا يقرأ أي
-- جدول عبر PostgREST — تحقّقنا: لا وجود لأي ‎.from("<table>")‎ في الكود.
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.relname);
  END LOOP;
END $$;
