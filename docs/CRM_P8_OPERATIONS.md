# CRM — P8: الفريق، RBAC، التدقيق، الإعدادات، التصدير، المراقبة، التعافي

مرجع تشغيلي لما يطبّقه الكود فعليًا (لا وعود). كل ما هو غير متحقَّق منه يُذكر صراحةً.
P1–P7 كما هي؛ P8 لا يضيف جداول ولا migrations ولا صلاحيات جديدة — يبني فوق
`admin_users`, `role_permissions`, `audit_logs`, `crm_settings`, `system_alerts`,
`domain_events`/`automation_runs`, `communications`, `integration_sync_logs`, `job_runs`.

## 1. الفريق (`/admin/team`, `src/server/modules/team/teamService.ts`)

| العملية | المسار | الصلاحية |
|---|---|---|
| قائمة/بحث/تصفية الأعضاء | `GET /api/admin/crm/team?q=&role=&active=` | `users.read` |
| تغيير الدور / تفعيل-تعطيل / الاسم | `PATCH /api/admin/crm/team/[id]` | `users.manage` |
| دعوة عضو | `POST /api/admin/crm/team` | `users.manage` |

- `users.manage` حصرية للمالك في الخريطة الافتراضية (`OWNER_ONLY_PERMISSIONS`) ولا يمكن
  منحها لدور آخر من المصفوفة (تُرفض 409 `OWNER_ONLY_PERMISSION`).
- قواعد الخادم (`src/lib/rbac/teamRules.ts`، تُطبَّق داخل معاملة مع قفل صف الهدف `FOR UPDATE`):
  لا تعديل للذات (دور/حالة)؛ الدور القديم `staff` غير قابل للإسناد (يبقى مقروءًا فقط)؛
  غير المالك لا يمسّ مالكًا ولا يمنح دور المالك؛ لا تعطيل/تخفيض لآخر مالك نشط.
- كل تعديل ناجح يكتب `audit_logs` في نفس المعاملة (`team.update` قبل/بعد، `team.invite`).
  المحاولات المرفوضة لا تكتب شيئًا.
- **الدعوة**: `supabase.auth.admin.inviteUserByEmail` عبر `SUPABASE_SERVICE_ROLE_KEY` (العميل
  القائم `src/lib/supabaseAdminClient.ts`). Supabase يرسل رابط الدعوة بإعدادات SMTP الخاصة
  به (الافتراضي محدود المعدل — راجع لوحة Supabase → Auth → Email). حساب Auth موجود بنفس
  البريد يُربط بدل رفضه (`outcome: "linked"`). بلا المفتاح → 503 `غير متاح — يحتاج إلى إعداد`.
  لا كلمات مرور تُدار من CRM إطلاقًا؛ إعادة تعيينها من Supabase Auth.
- التعطيل فوري: `requireAdmin` يرفض `isActive=false` في كل طلب (لا اعتماد على انتهاء الجلسة).
- `lastLoginAt` هو "آخر نشاط" المتاح فعليًا (يُحدَّث عند الدخول فقط).

## 2. RBAC (`role_permissions`)

- الكتالوج الرسمي في الكود `src/lib/rbac/permissions.ts`؛ الجدول هو المرجع للتفويض
  (`requirePermission` يقرؤه في كل طلب — أي تبديل يسري فورًا بلا نشر). رفض افتراضي، لا wildcard.
- المصفوفة: `GET/PATCH /api/admin/crm/team/permissions` (`users.read` / `users.manage`).
  التبديل idempotent (`INSERT … ON CONFLICT DO NOTHING` / `deleteMany`، يعيد `changed`)
  وآمن تحت التزامن (UNIQUE(role, permission))، ويوثَّق `rbac.update` عند التغيير فقط.
- قيود ثابتة: خريطة المالك مقفلة (= الكتالوج كاملًا)؛ الصلاحيات الحصرية للمالك لا تُمنح؛
  لا أحد يعدّل خريطة دوره هو (منع منح الذات).
- صلاحية جديدة = إضافة للكتالوج + migration seed (اختبار `rbacCatalog` يفرض التطابق).

## 3. سجل التدقيق (`/admin/audit`)

- إلحاقي فقط: لا مسار تعديل/حذف، ولا سياسة حذف دوري (`dataRetentionService` يلمس
  tracking/page views/web vitals/idempotency فقط — لا `audit_logs`). النمو غير محدود
  بالتصميم؛ راجع §12.
- فلاتر: الإجراء، نوع الكيان، معرّف الكيان، معرّف الفاعل، من/إلى (UTC)، ترقيم 25، الأحدث
  أولًا بفاصل تعادل `id`. يعرض بريد الفاعل الإداري، والسبب، و`correlationId`.
- PII: `before/after` تُنقَّح وقت الكتابة (`redactForAudit`: أسرار/توكنات → `[REDACTED]`،
  هواتف → `05*******89`، عناوين مقتطعة). لا تنقيح لاحق ولا يمكن استرجاع الأصل من السجل.
- تصدير CSV بنفس الفلاتر (يتطلب `exports.create` إضافةً إلى `audit.read`).

## 4. إعدادات CRM (`/admin/settings` → تبويب «إعدادات CRM»)

قائمة كما في P3–P7 (`src/lib/validation/crmSettingsSchema.ts`) — zod، defaults، audit
(`settings`)، `settings.read/manage`. لا صلاحيات داخلها. المفاتيح: `risk_weights`,
`risk_thresholds`, `segmentation_thresholds`, `fraud_thresholds`, `task_sla_minutes`,
`shipping_reconciliation`, `packaging_cost_dzd`,
`export_max_rows` (100–100000، افتراضي 10000)، `automation_enabled`.

`attribution_window_days` أُزيل في التدقيق النهائي: لم يقرأه أي كود (نافذة P7 ثابتة 90 يومًا في
المتصفح) فكان إعدادًا مضلِّلًا؛ صفه القديم في `crm_settings` إن وُجد يُتجاهل (القراءة version-tolerant).

## 5. التصدير (`GET /api/admin/crm/exports`, `src/server/modules/exports/exportsService.ts`)

| `entity` | الصلاحية المطلوبة (مع `exports.create`) |
|---|---|
| `orders` | `orders.read` |
| `customers` | `customers.read` |
| `returns` | `returns.read` |
| `settlements` | `finance.read` |
| `audit` | `audit.read` |

- فلاتر: `dateFrom`/`dateTo` (ISO، على `createdAt` — `settlementDate` للتسويات)،
  `status` (حالة الكيان؛ للتدقيق = الإجراء).
- CSV UTF-8 مع BOM، CRLF، تواريخ ISO UTC، مبالغ DZD أعداد صحيحة كما هي، حماية من حقن الصيغ.
- **الحد** `export_max_rows`: يُفحص بـ`count` قبل الجلب؛ التجاوز → **413 `TOO_LARGE`** مع
  العدد والحد (لا اقتطاع صامت أبدًا). تصدير متزامن في الذاكرة (لا طابور) — الحد الأقصى
  للإعداد 100000 صف هو السقف التشغيلي الموثّق.
- طلبات `isTest` مستبعدة (الطلبات والمرتجعات). هاتف العميل كاملًا فقط لمن يملك
  `customers.read`؛ غيره (مثل `marketing`) يحصل عليه مقنَّعًا.
- كل تصدير يوثَّق: `audit action="export"` بالكيان والفلاتر والعدد و`fullPhone`.
- أيام العمل بتوقيت الجزائر ليست معيار الفلترة (UTC صريح في الأعمدة) — من يحتاج يومًا
  محليًا يمرّر حدود UTC المقابلة (الجزائر UTC+1 بلا توقيت صيفي).

## 6. المراقبة وحالة النظام

- **عام** `GET /api/health` → `{status:"ok"|"error"}` (ping قاعدة البيانات فقط)، بلا مصادقة
  — يستعمله Docker HEALTHCHECK وworkflow `health-monitor.yml` (كل 15 دقيقة اسميًا؛ GitHub
  يؤخّر الجداول أحيانًا — الفشل يُرسل بريدًا لمراقبي المستودع).
- **تفصيلي** `GET /api/admin/crm/system-status` و`/admin/system` (`settings.read`): قاعدة
  البيانات وزمن الاستجابة؛ هجرات Prisma (`_prisma_migrations`: المطبّقة/الفاشلة/الأخيرة)؛
  صندوق الأحداث (معلّق، أقدم معلّق، أحداث فاشلة، تنفيذات مهملة)؛ التواصل (في الانتظار،
  فشل 7 أيام)؛ Google Sheets (مضبوط؟ فشل 24 ساعة، آخر تشغيلة)؛ آخر تشغيلة لكل مهمة دورية
  (`job_runs`)؛ التنبيهات المفتوحة حسب الشدة + آخر 10. كل مصدر معزول: فشله يظهر في `errors`
  بدل 500. لا أسرار.
- الإجراءات: إعادة حدث فاشل (`/admin/automation`، `automation.retry`)، إعادة/إلغاء رسالة
  (`communications.send`)، إقرار/حل تنبيه (`/api/admin/alerts/[id]/*`) — كلها موجودة من
  P5–P7 وموثّقة audit.
- ما **لا** يُرصد في القاعدة: فشل المصادقة/التفويض (401/403) — يُسجَّل في سجلات Vercel
  (`console.error` JSON `auth_check_failed`) فقط؛ حدود الدخول في Upstash. لا لوحة لها.

## 7. النسخ الاحتياطي والتعافي (DR) — الحالة الفعلية

| البند | الواقع المتحقَّق منه |
|---|---|
| قاعدة البيانات | Supabase (Postgres 17)، خطة Free: **لا PITR ولا نسخ تلقائي من Supabase** (تحقّق سابق عبر Management API: `pitr_enabled=false`, `backups=[]`). |
| النسخ الفعلي | workflow `.github/workflows/db-backup.yml` على المستودع الخاص `store-dz-e2e-verify` فقط: `pg_dump --schema=public --format=custom` يوميًا 02:00 UTC، ثم **استعادة تحقق فعلية** في حاوية Postgres 17 مؤقتة (عدد الجداول ≥10 وجدول orders موجود) قبل الرفع. آخر 5 تشغيلات مجدولة (14–18/09/2026) ناجحة (`gh run list`). |
| الاحتفاظ | artifact لمدة 30 يومًا (تاريخ أقدم من ذلك غير قابل للاستعادة). |
| RPO | ≤ 24 ساعة (نسخة يومية). |
| RTO | تقديري 1–2 ساعة: إنشاء مشروع Supabase جديد + `pg_restore` + تحديث متغيرات Vercel + إعادة نشر. **غير مُقاس بتمرين استعادة كامل إلى بيئة إنتاج بديلة** — مطلوب تمرين يدوي. |
| خارج النسخة | مخطط `auth` في Supabase (حسابات الدخول) ووسائط `product-images` في Supabase Storage — مسؤولية Supabase المُدارة؛ لا نسخة مستقلة لهما (اعتماد تشغيلي مصرَّح). |
| Redis (Upstash) | أقفال مهام وحدود معدل فقط — لا بيانات مرجعية؛ فقدانه لا يفقد بيانات. |

**إجراء الاستعادة** (يدوي، يحتاج صلاحيات المستودع الخاص وSupabase وVercel):
1. حمّل artifact `db-backup-<timestamp>` من Actions المستودع الخاص.
2. مشروع Supabase (نفسه بعد تفريغ `public`، أو جديد): `pg_restore --clean --if-exists --no-owner --no-privileges -d <DIRECT_URL> backup.dump`.
3. تحقق: `SELECT count(*) FROM orders;` و`SELECT migration_name FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 1;` يجب أن يطابق آخر migration في `prisma/migrations`.
4. إن كان مشروعًا جديدًا: أعد إنشاء مستخدمي Auth (المالك على الأقل) وحدّث `admin_users.auth_user_id`؛ اضبط `DATABASE_URL`/`DIRECT_URL`/مفاتيح Supabase في Vercel، ثم أعد النشر (`prisma migrate deploy` يعمل تلقائيًا في البناء ويجب أن يقول "No pending migrations").
5. افتح `/admin/system`: قاعدة البيانات سليمة، الهجرات بلا فاشل، ثم اختبر طلبًا حقيقيًا.

المتغيرات اللازمة للتعافي: `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SECRETS_ENCRYPTION_KEY`
(بدونه تُصبح توكنات التكاملات المشفّرة في القاعدة غير قابلة للقراءة — احفظه في مدير أسرار
منفصل)، `UPSTASH_*`, `CRON_SECRET`, وباقي `.env.local.example`.

## 8. الأمان — ما تم فحصه في P8

- **المصادقة/التفويض**: Supabase session + `admin_users.isActive` (`requireAdmin`) ثم
  `requirePermission` من القاعدة على كل مسار P8؛ لا فحص عميل. E2E `p8-operations` يثبت
  401/403/قراءة فقط.
- **CORS**: صريح في `next.config.ts` على `/api/*`: `Access-Control-Allow-Origin` = أصل الموقع فقط (لا `*`)؛
  ردود `/api/admin|mcp|auth` بـ`Cache-Control: private, no-store`؛ الجلسة كوكي
  `SameSite=Lax`.
- **الرؤوس**: `X-Frame-Options: DENY`, HSTS preload، CSP بـnonce لكل طلب (`middleware.ts`).
- **حدود المعدل** (Upstash): الدخول 5/15د (IP وبريد)، الطلبات، العملاء المحتملون 10/10د،
  التتبع 60/5د، الكوبونات. مسارات الإدارة خلف الجلسة بلا حد إضافي.
- **Cron**: 14 استعمالًا لـ`verifyCronSecret` (يفشل مغلقًا بلا `CRON_SECRET`).
- **Webhooks**: DHD بسرّ مُتحقَّق (`verifyDhdWebhookSecret`)، idempotency دائم في PostgreSQL.
- **الأسرار**: لا `NEXT_PUBLIC_*` حساس؛ توكنات التكاملات مشفّرة في القاعدة؛ صفحات
  الإعدادات تحذف التوكنات قبل أي مكوّن عميل؛ `redactForAudit/Logs` على السجلات.
- **PII**: التصدير حسب الصلاحية مع قناع الهاتف؛ التدقيق منقّح وقت الكتابة (§3، §9).
- **التبعيات** (`npm audit --omit=dev`): كان 32 (1 حرج: Next.js RCE في Image Optimization
  GHSA-2xp9-vwfh-vxw4 يمسّ الإنتاج على Vercel). بعد P8: `next` 16.3.5، `sharp` 0.35.4،
  `@tiptap/*` 3.31.3، Prisma 7.10.0 (CLI وclient متطابقان) → المتبقي 2: `mysql2` عبر
  `prisma` CLI (سائق MySQL غير مستعمل ولا يُحمَّل؛ إصلاحه = تخفيض prisma 6). Trivy في
  `docker-verify.yml` كما هو.
- **CSV injection**: الخلايا التي تبدأ بـ`= + - @` تُسبق بفاصلة عليا.

## 9. حوكمة البيانات وPII (السلوك الفعلي)

| البيان | أين | من يراه | من يصدّره |
|---|---|---|---|
| هاتف العميل | `orders.phone/phone_normalized`, `customers.primary_phone`, `customer_phones` | `orders.read` (الطلبات) / `customers.read` | كاملًا: `exports.create`+`customers.read`؛ مقنَّعًا: `exports.create`+`orders.read` |
| الاسم والعنوان والبلدية | `orders.*`, `customers.*` | نفس القراءة | الطلبات/العملاء (العنوان غير مُصدَّر) |
| IP / User-Agent / بصمة الجهاز | `orders.ip_address/user_agent/device_fingerprint`, `audit_logs.ip/user_agent` | الطلب: `orders.read`؛ التدقيق: `audit.read` | لا يُصدَّر |
| ملاحظات داخلية | `customers.notes_internal` | `customers.read` | لا |
| السجلات التشغيلية | Vercel logs (JSON منقّح) | مشرفو Vercel | — |

- الاحتفاظ: أحداث التتبع/المشاهدات/Web Vitals تُحذف دوريًا (`cleanup-tracking`)؛ الطلبات
  والعملاء والتدقيق والمالية دائمة (لا سياسة حذف — لقطات مالية غير قابلة للتغيير بحكم P6).
- إخفاء الهوية: `customers.anonymize` (مالك فقط) موجود من P2 — يُنقّي بيانات العميل ولا
  يمسّ سجل التدقيق الإلحاقي (الذي كان منقّحًا أصلًا).
- لا ادّعاء امتثال قانوني هنا؛ هذا وصف لما يفعله التطبيق.

## 10. الأداء (فحص P8 للمسارات الحرجة)

- كل قوائم الإدارة مرقّمة بحد أقصى (`pageSize ≤ 100`) وترتيب حتمي؛ P8 نفسه: الفريق
  ≤500 (بلا ترقيم، فريق صغير)، التصدير محدود بالإعداد، حالة النظام = عدّادات مفهرسة
  (`status`, `job, started_at DESC`, `integration, started_at DESC`, `resolvedAt`).
- لا نداءات خارجية داخل معاملات قاعدة البيانات في P8 (دعوة Supabase تسبق المعاملة).
- `SELECT DISTINCT ON (job)` على `job_runs` يستعمل الفهرس المركب القائم.
- لم تُضَف فهارس: لا استعلام جديد بلا فهرس. لم يُقَس حمل إنتاجي (لا أداة قياس في
  المشروع) — مذكور كحدّ صريح، لا ادّعاء.

## 11. Runbook مختصر

| العرض | أين تنظر | الإجراء |
|---|---|---|
| `/api/health` = 503 | Vercel logs، Supabase status | قاعدة البيانات/الشبكة؛ لا شيء في الكود يُصلحه |
| بطاقة الهجرات حمراء | `/admin/system` | migration فاشلة: `prisma migrate resolve` يدويًا بعد الفحص (راجع `prisma/MIGRATIONS.md`) |
| أحداث فاشلة / dead-letter | `/admin/automation?status=failed` | افحص الخطأ، أصلح السبب (Sheets endpoint، مزوّد)، «إعادة» بسبب |
| Sheets فشل 24 ساعة | `/admin/system` بطاقة Sheets | `ORDER_SHEETS_ENDPOINT` ونشر سكربت v3 |
| رسائل فاشلة | `/admin/orders/[id]` لوحة التواصل | مزوّد غير متاح = إعداد مفقود؛ لا إعادة آلية |
| تنبيه `critical/high` | `/admin/system` أو `/api/admin/alerts` | حسب النوع (تسوية متعارضة، مخزون، dead-letter) ثم إقرار/حل |
| عضو فقد الوصول | `/admin/team` | الحالة معطّلة؟ الدور؟ حساب Auth (Supabase) موجود؟ |
| تصدير 413 | — | ضيّق التاريخ/الحالة أو ارفع `export_max_rows` (≤100000) |
| التراجع عن نشر | Vercel → Deployments → Promote السابق | الهجرات إضافية فقط (لا تراجع لها)؛ P8 بلا migration |

## 12. الحدود المعروفة

- لا تمرين استعادة كامل إلى إنتاج بديل (RTO تقديري).
- مراقبة 401/403 من السجلات فقط.
- التصدير متزامن (سقف 100000 صف).
- سجل التدقيق بلا حذف دوري — النمو مقصود.
