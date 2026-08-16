# إعداد لوحة التحكم (Backend) — الخطوات المطلوبة منك

الكود كامل وجاهز ومختبر (فحص الأنواع، الأخطاء، والبناء كلها ناجحة 100%). باقي فقط ربط 3 خدمات مجانية باش يشتغل كل شيء فعليًا.

## 1. Supabase (قاعدة البيانات + تسجيل الدخول + الصور)

1. روح لـ https://supabase.com وسجل حساب (مجاني)
2. أنشئ مشروع جديد (New Project)، اختر كلمة مرور قوية لقاعدة البيانات واحفظها
3. من **Project Settings → API**، انسخ:
   - `Project URL` → هذا هو `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → هذا هو `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key (تحت "Reveal") → هذا هو `SUPABASE_SERVICE_ROLE_KEY` (**سري، لا تشاركه أبدًا**)
4. من **Project Settings → Database → Connection string**:
   - اختر **Transaction pooler** (منفذ 6543) → هذا هو `DATABASE_URL`
   - اختر **Session pooler** أو **Direct connection** (منفذ 5432) → هذا هو `DIRECT_URL`
   - فكل رابط، بدّل `[YOUR-PASSWORD]` بكلمة مرور قاعدة البيانات لي حطيتها فالخطوة 2

## 2. إنشاء مخزن الصور (Storage Bucket)

1. من القائمة الجانبية فـ Supabase: **Storage**
2. أنشئ Bucket جديد اسمه بالضبط: `product-images`
3. فعّل **Public bucket** (باش الصور تبان فالموقع)

## 3. إنشاء حسابك الإداري (Admin User)

1. من القائمة الجانبية: **Authentication → Users → Add user**
2. أدخل بريدك الإلكتروني وكلمة مرور، وفعّل **Auto Confirm User**
3. انسخ الـ **User UID** لي يبان (شكلو أرقام وحروف طويلة)
4. من القائمة الجانبية: **SQL Editor**، شغّل هذا الاستعلام (بدّل القيم بمعلوماتك):

```sql
insert into admin_users (auth_user_id, email, full_name, role)
values ('USER_UID_من_الخطوة_3', 'بريدك@example.com', 'اسمك الكامل', 'owner');
```

(هذا الجدول ينشأ تلقائيًا بعد ما ندير migrate فالخطوة 5 — رجع لهاذي الخطوة بعدها)

## 4. Upstash Redis (لتحديد المعدل / مكافحة الطلبات الوهمية)

1. روح لـ https://upstash.com وسجل حساب (مجاني)
2. أنشئ قاعدة بيانات Redis جديدة (Create Database)
3. من صفحة القاعدة، تحت **REST API**، انسخ:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

## 5. اجمع كل المفاتيح وابعثهملي

ابعثلي هاذي القيم (كلها فـ `.env.local` عندي دابا فارغة، وأنا نحطهم):

```
DATABASE_URL=
DIRECT_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

بمجرد ما توصلني، نديرو:
1. `prisma migrate dev` — ينشئ كل الجداول فقاعدة بياناتك
2. `prisma db seed` — ينقل منتجاتك ووﻻياتك الحالية للقاعدة الجديدة
3. نرجعو لخطوة 3 فوق (SQL Editor) باش نربطو حسابك الإداري
4. نختبر كل شيء: تسجيل الدخول، الطلبات، المنتجات، رفع الصور

## ملاحظة أمان
لا تبعث الـ `service_role` key أو كلمة مرور قاعدة البيانات فأي مكان عام (فقط هنا فالمحادثة الخاصة). هذا المفتاح يعطي وصول كامل بلا قيود لقاعدة بياناتك.
