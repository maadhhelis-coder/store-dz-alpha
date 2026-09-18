# CRM — P7: العزو، Google Sheets، التواصل، الأتمتة (outbox)

مرجع تشغيلي لما يطبّقه الكود فعليًا. PostgreSQL هو المرجع الوحيد للحقيقة والـidempotency؛
Redis (Upstash) قفل المهام فقط. لا طوابير ولا بنية تحتية جديدة.

## 1. العزو (`src/lib/attribution.ts` + `src/lib/tracking.ts`)

- لقطة واحدة في `localStorage["sdz_attr"]` = `{ first, last }`، عمرها **90 يومًا** من `first.capturedAt`.
  لا cookies للعزو (localStorage على أصل المتجر فقط؛ cookies الجلسة القائمة SameSite=Lax كما هي).
- **first-touch** يُكتب مرة واحدة ولا يُدهس بأي زيارة لاحقة ما دامت اللقطة حيّة. **last-touch**
  يُستبدل بكل زيارة تحمل معلمات عزو. زيارة بلا معلمات لا تمسّ اللقطة.
- المعلمات المقروءة: `utm_source|platform`, `utm_medium`, `utm_campaign`, `utm_content|creative`,
  `utm_term`, `campaign_id`, `adset_id`, `ad_id` + مسار الهبوط. `provenance = "url"` و`capturedAt`.
  لا تخمين: غير الموجود يبقى `null`.
- المفتاح القديم `sdz_attribution` (30 يومًا، platform+creative) يُرحَّل مرة واحدة كلمسة أولى/أخيرة.
- **لقطة الطلب**: `POST /api/orders` يقبل `attribution: {first,last}` (zod) ويكتب وقت الإنشاء:
  `platform/creativeName/utm*/landingPath/campaignId/adSetId/adId` من **last** (أساس تخصيص
  إعلانات P6) و`firstTouchPlatform/firstTouchUtmSource/firstTouchUtmCampaign` من **first**.
  لا تُعاد حسابها لاحقًا ولا تُمسّ لقطات الطلبات التاريخية. بلا لقطة = حقول فارغة (حالة صريحة).
- P6 يستهلك نفس الأعمدة (`platform`+`creativeName` للتخصيص، `utmCampaign/adSetId/adId/landingPath`
  للأبعاد) — لا نموذج عزو ثانٍ.

## 2. Google Sheets (`src/server/modules/integrations/sheetsSync.ts`)

- المزامنة **من الخادم عبر outbox** (`order.created:sheets-sync`, `order.status_changed:sheets-sync`)؛
  أُزيل الإرسال من المتصفح. الرابط: `ORDER_SHEETS_ENDPOINT` (يُقبل `NEXT_PUBLIC_ORDER_ENDPOINT` القديم).
  لا مفاتيح Google في الكود ولا في المتصفح (Apps Script Web App بلا سر).
- الحمولة تحمل `action` + `orderNumber` + `status`؛ سكربت النسخة 3 (راجع GOOGLE_SHEETS_SETUP.md)
  يزيل التكرار بـ`orderNumber` فإعادة المحاولة بعد timeout لا تُنتج صفًا ثانيًا.
- Idempotency: `automation_runs UNIQUE(event_id, handler)` (نجاح واحد لكل حدث) + dedupe في السكربت.
- الفشل (HTTP غير 2xx، رد غير JSON، `status != ok`، timeout 15s) يُرمى → المشغّل يعيد المحاولة
  (3) ثم dead-letter + `SystemAlert(dead_letter_accumulation)`. كل تشغيلة في `integration_sync_logs`.
- الشيت مرآة لا مرجع؛ لا يكتب في القاعدة أبدًا. لا مزامنة مخزون → Sheets (لم تكن موجودة، خارج P7).
- طلبات `isTest` وتشغيلات E2E (`E2E_TEST_RUN=1`) تُتخطّى.

## 3. التواصل (`src/server/modules/communications/*`)

- المعمارية: التطبيق/المعالِج → `communicationService` → مزوّد (`providers.ts`) → API خارجي.
  لا منطق مزوّد في route handlers.
- المزوّدون: `whatsapp_deeplink` (رابط wa.me — **manual**، لا "sent" آلي؛ الموظف يؤكد «أُرسلت ✓»)،
  `whatsapp_cloud` (Meta Cloud API؛ بلا `WHATSAPP_CLOUD_ACCESS_TOKEN`/`WHATSAPP_CLOUD_PHONE_NUMBER_ID`
  = **unavailable** صريح)، `sms` (stub: unavailable — لا مزوّد متعاقَد)، `gmail` (التكامل الحالي
  بصلاحية `gmail.readonly` فقط → unavailable بسبب واضح).
- دورة الحياة (enum القاعدة): `queued → sending → sent | failed`، `delivered` عند تأكيد المزوّد،
  `cancelled` إجراء بشري. unavailable = `failed` بـ`provider_unavailable:` وبلا إعادة آلية.
- Idempotency دائم: `communications.dedupe_key UNIQUE` (الرسائل الآلية: `order:<id>:status:<to>`) +
  claim CAS على `lease_until` عند الإرسال (متزامنان → مرسل واحد). المحاولات ≤ 3 ثم
  `SystemAlert(communication_failed)`. إعادة الفاشل مؤقتًا داخل cron `automation-drain`.
- إجراءات موثّقة (audit): إدراج، إعادة يدوية، إلغاء، تأكيد الإرسال اليدوي.
- طلبات `isTest` مرفوضة على مستوى الخدمة (`TEST_ORDER`).

## 4. outbox والأتمتة (`src/server/modules/automation/*`)

- الأحداث تُكتب داخل معاملة التغيير التجاري (P1–P6 كما هي): `order.created`, `order.status_changed`,
  `shipment.created`, `return.created`.
- مسار التنفيذ: نبضة `after()` بعد كل كتابة (`nudgeOutbox`) + cron `automation-drain` يوميًا
  (حدود خطة الاستضافة) كشبكة أمان. claim CAS بـlease 120s، دفعة 20، `automation_runs`
  UNIQUE(event, handler) بوابة عدم التكرار، محاولات ≤ 3 ثم dead-letter + SystemAlert،
  عزل المعالِجات (فشل معالِج لا يمنع أحداثًا أخرى)، منع الحلقات بـcausation/depth.
- المعالِجات المسجَّلة: `shipment.created:dispatch` (P5)، `order.created:sheets-sync`،
  `order.status_changed:sheets-sync`، `order.status_changed:notify-customer`.
  لا معالِج يكتب حدثًا جديدًا (لا سلاسل).
- التفعيل لكل معالِج: `crm_settings.automation_enabled[<handler>]`. الافتراضي: الشيت مفعّل؛
  **رسائل الزبون معطّلة** لأن الوكيل الخارجي (store-dz-agent) يراسل الزبائن حاليًا — التفعيل
  مع بقاء الوكيل = رسالتان.
- المراقبة: `/admin/automation` (`automation.read`) — الحالات، التنفيذات، الأخطاء، آخر مزامنات
  الشيت. الإعادة اليدوية للفاشل (`automation.retry`، سبب إلزامي، audit) تعيد الحدث `pending`
  وتفتح تنفيذات dead-letter؛ الناجحة تبقى ناجحة (لا تنفيذ مزدوج).

## 5. Cron

`/api/cron/automation-drain` (موجود) = تصريف outbox + إعادة الرسائل الفاشلة مؤقتًا، خلف
`CRON_SECRET` (يفشل مغلقًا) وقفل `jobLock` (Upstash) و`job_runs`. لا جدولة جديدة.

## 6. الصلاحيات (role_permissions)

| العملية | الصلاحية |
|---|---|
| سجل التواصل | `communications.read` |
| إرسال/إعادة/إلغاء/تأكيد رسالة | `communications.send` |
| مراقبة الأتمتة والشيت | `automation.read` (جديدة: owner/admin/viewer/accountant) |
| إعادة حدث فاشل | `automation.retry` (جديدة: owner/admin) |
| العزو في صفحة الطلب | `orders.read` |

## 7. حدود تشغيلية معروفة

- WhatsApp Cloud API/SMS/Gmail إرسالًا غير مفعّلة الآن (ضبط/نطاق/مزوّد) — الحالة تُعرض `unavailable`
  ولا تُدّعى. رسائل الزبون تصل عبر الوكيل الخارجي كما قبل P7.
- الشيت يحتاج نشر سكربت النسخة 3 حتى يعمل إلغاء التكرار وتحديث الحالة؛ السكربت القديم يستمر
  في إضافة صفوف (بلا كسر).
- cron يومي فقط (خطة الاستضافة) — الزمن المنخفض من نبضة `after()`؛ حدث فاشل ينتظر النبضة
  التالية أو الـcron.
- العزو من الرابط فقط (لا cookies طرف ثالث، لا استنتاج من referrer).
