# Database Migrations — طريقة التشغيل والسياسات

## اتصال الـCLI مقابل اتصال التطبيق (مهم جدًا)

هذا المشروع يستعمل **رابطي اتصال مختلفين** لغرضين مختلفين تمامًا — الخلط بينهما هو سبب تعليق
`prisma migrate dev`/`migrate deploy` سابقًا:

| المتغيّر | من يستعمله | نوع الاتصال (Supabase) | المنفذ |
|---|---|---|---|
| `DATABASE_URL` | التطبيق وقت التشغيل فقط (`src/server/db/prisma.ts`) | Transaction Pooler | 6543 |
| `DIRECT_URL` | Prisma CLI فقط (`prisma.config.ts`) — `migrate dev`/`migrate deploy`/`migrate status`/`generate`/`studio` | Session Pooler | 5432 |

**السبب**: محرك الـmigrations في Prisma يحتاج Advisory Locks تعمل على نفس الاتصال طوال العملية —
وهذا غير متوافق مع Transaction Pooler (كل استعلام قد يهبط على اتصال خلفي مختلف). Session Pooler
(منفذ 5432) يحافظ على اتصال ثابت طوال الجلسة، فيعمل بشكل صحيح.

`src/server/db/prisma.ts` يقرأ `process.env.DATABASE_URL` مباشرة عبر `@prisma/adapter-pg` — بمعزل
تام عن `prisma.config.ts`. أي تعديل على `prisma.config.ts` **لا يغيّر سلوك التطبيق وقت التشغيل
إطلاقًا**، فقط الاتصال الذي تستعمله أوامر الـCLI.

## تشغيل Migrations في Production

**تلقائي بالكامل الآن.** سكربت `build` في `package.json` أصبح:

```json
"build": "prisma migrate deploy && next build"
```

كل نشرة (deploy) على Vercel تُطبِّق أي migration معلَّقة تلقائيًا **قبل** بناء التطبيق — لا حاجة
لتشغيل أي أمر يدوي بعد الآن. إن فشل تطبيق الـmigration، يفشل البناء كاملًا (بتصميم — لا يجب أبدًا
نشر كود تطبيق يفترض بنية قاعدة بيانات لم تُطبَّق فعليًا).

هذا يستعمل تلقائيًا `DIRECT_URL` (بفضل `prisma.config.ts`)، ويعني أيضًا أن **كل نشرة قادمة تُعيد
إثبات صحة إعداد `DIRECT_URL` من تلقاء نفسها** — لو كان الاتصال خاطئًا، سيظهر ذلك فورًا في سجل
البناء بدل أن يبقى افتراضًا غير مُتحقَّق منه.

للتشغيل اليدوي/التحقق المستقل خارج دورة النشر (اختياري):

```bash
npm run migrate:deploy   # يطبّق أي migration معلَّقة يدويًا
npm run migrate:status   # يتحقق فقط، بلا تطبيق أي شيء
```

### متغيرات البيئة المطلوبة في بيئة الإنتاج (Vercel)

تأكد من ضبط **كلا** المتغيرين في إعدادات البيئة (أسماء فقط، لا قيم حقيقية هنا):

- `DATABASE_URL` → رابط Transaction Pooler (منفذ 6543) — لتشغيل التطبيق.
- `DIRECT_URL` → رابط Session Pooler (منفذ 5432) — لتشغيل الـmigrations فقط.

كلاهما من نفس مشروع Supabase، بنفس بيانات الاعتماد، يختلفان فقط بالمنفذ/نوع الـpooling. لا تضع أي
قيمة حقيقية لهذين المتغيرين في Git — كلاهما مذكور فقط بالاسم هنا، والقيم الفعلية تعيش حصرًا في
`.env.local` (مستثنى عبر `.gitignore`) وفي متغيرات بيئة الاستضافة.

**✅ حالة Production — مؤكَّدة نهائيًا من سجل بناء Vercel الحقيقي (2026-08-15):** نشرة إنتاج فعلية
(`npx vercel --prod`) أظهرت في سجل البناء:

```
> prisma migrate deploy && next build
Datasource "db": PostgreSQL database "postgres", schema "public" at "aws-0-eu-west-1.pooler.supabase.com:5432"
21 migrations found in prisma/migrations
No pending migrations to apply.
```

هذا دليل مباشر من بيئة Production الحقيقية نفسها (وليس تخمينًا أو ثقة بقيمة مقروءة يدويًا) —
`DIRECT_URL` صحيح، والاتصال يعمل بلا أي تعليق، وMigrations تُطبَّق تلقائيًا كجزء دائم من كل نشرة
من الآن فصاعدًا (راجع قسم "تشغيل Migrations في Production" أعلاه).

لتغيير القيمة مستقبلًا:

```bash
vercel env rm DIRECT_URL production        # احذف القيمة الحالية
vercel env add DIRECT_URL production       # أدخل القيمة الجديدة عند الطلب
```

أو عبر لوحة Vercel: **Project → Settings → Environment Variables** → عدّل/أضف `DIRECT_URL` لبيئة
Production بنفس رابط Supabase الحالي مع تغيير `:6543` إلى `:5432`.

## سياسة Migrations المستقبلية

### 1. لا تحذف جداول تحتوي بيانات حقيقية مباشرة

اتبع نمط Expand → Contract:
1. أضف البنية الجديدة (عمود/جدول) بجانب القديمة.
2. انقل التطبيق لاستعمال الجديدة مع الإبقاء على القديمة.
3. تحقّق (نسخة احتياطية + مطابقة بيانات) أن كل شيء يعمل صحيحًا.
4. فقط بعدها، migration منفصلة تحذف القديمة.

لا تُسقط جدولًا يحتوي بيانات إنتاج فعلية في نفس migration التي تستبدله، إلا بعد نسخ احتياطي مؤكَّد.

### 2. فهارس على جداول كبيرة → `CREATE INDEX CONCURRENTLY`

عند إضافة فهرس لجدول يحتوي حجم بيانات إنتاج معتبر (وليس عشرات الصفوف كالوضع الحالي):

```bash
npx prisma migrate dev --create-only --name add_big_table_index
```

عدّل ملف الـSQL الناتج يدويًا لاستعمال `CREATE INDEX CONCURRENTLY`. **تنبيه**: `CONCURRENTLY` لا
يمكن تشغيله داخل Transaction، و`prisma migrate deploy`/`dev` يُنفّذان محتوى الملف داخل واحدة —
فهذا الأمر تحديدًا سيفشل لو طُبِّق عبر `migrate deploy` العادي. الإجراء الصحيح:

```bash
# 1. طبّق الفهرس مباشرة عبر db execute (لا يُنفَّذ داخل Transaction — مُختبَر فعليًا، انظر أدناه)
npx prisma db execute --file prisma/migrations/<اسم_الmigration>/migration.sql

# 2. سجّله كـ"مُطبَّق" في _prisma_migrations بلا إعادة تنفيذه، حتى لا يحاول migrate deploy
#    القادم تطبيقه من جديد (وسيفشل لأن الفهرس موجود بالفعل)
npx prisma migrate resolve --applied <اسم_الmigration>
```

**✅ هذا الإجراء مُختبَر فعليًا وليس نظريًا فقط** — تم تنفيذ دورة كاملة حية على قاعدة الإنتاج
(2026-08-15): `CREATE INDEX CONCURRENTLY` عبر `prisma db execute --stdin` نجح دون أي خطأ "cannot
run inside a transaction block"، تحقّقنا من وجود الفهرس فعليًا عبر `pg_indexes`، ثم
`DROP INDEX CONCURRENTLY` بنفس الطريقة لإزالته (فهرس تجريبي فقط، لا حاجة فعلية له الآن)، وتحقّقنا
من اختفائه. `_prisma_migrations` بقي بلا أي تغيير طوال العملية (21 صفًا قبل وبعد) — الآلية سليمة
100% على هذا المشروع تحديدًا، وليست افتراضًا من التوثيق العام لـPrisma.

ملاحظة إصدار: في Prisma 7، أمر `db execute` لم يعد يقبل `--schema` (يقرأ الإعداد تلقائيًا من
`prisma.config.ts`)، ويقبل `--file <path>` أو `--stdin` فقط كمصدر للسكربت.

اختبر هذا التسلسل على بيئة اختبار أولًا قبل أي استعمال في Production.

### 3. أسماء الفهارس والقيود — الحد الأقصى 63 بايت

Postgres يقتطع أي معرّف (اسم فهرس/قيد) أطول من 63 بايت بصمت. عند إضافة `@@unique([...])` أو
`@@index([...])` مركّب على أعمدة بأسماء طويلة، ولاحظت أن Prisma سيولّد اسمًا قريبًا من هذا الحد،
حدّد اسمًا صريحًا أقصر عبر `map`:

```prisma
@@unique([provider, wilayaCode, storeCommune], map: "courier_mapping_unique")
```

لا داعي لتغيير أي فهرس/قيد موجود حاليًا يعمل بشكل صحيح — هذا فقط لتفادي المشكلة في migrations
مستقبلية.
