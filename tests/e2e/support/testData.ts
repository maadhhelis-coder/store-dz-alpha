// أدوات توليد بيانات اختبار E2E معزولة منطقيًا داخل نفس قاعدة الإنتاج (قرار العزل: راجع
// tests/e2e/README.md). كل بيانات E2E تحمل بادئة/نمطًا مميّزًا يمكن حذفه بأمان بعد كل
// تشغيل، بدل قاعدة بيانات منفصلة فعليًا (Docker غير متاح في بيئة العمل هذه، ولا مشروع
// Supabase اختباري منفصل بعد).

export const E2E_PREFIX = "e2e";

// مُعرّف فريد لكل تشغيل — يُستعمل بادئةً فكل slug/اسم منتج/فئة تُنشأ أثناء الاختبارات،
// حتى يمكن تمييز بيانات هذا التشغيل تحديدًا (وحذفها) بلا تعارض مع تشغيلات متزامنة أخرى.
export function getRunId(): string {
  if (!process.env.E2E_RUN_ID) {
    throw new Error("E2E_RUN_ID غير مضبوط — يجب تشغيل الاختبارات عبر playwright.config.ts (globalSetup يضبطه)");
  }
  return process.env.E2E_RUN_ID;
}

// معرّف عشوائي فريد (وليس عدادًا تسلسليًا فذاكرة الوحدة — Playwright قد يُعيد تحميل ملف
// الاختبار لكل test() فبعض الحالات، فيصفّر أي عداد محلي، مما تسبَّب فعليًا فتعارض slugs
// عند تشغيل هذه المجموعة أول مرة). عشوائية Math.random كافية هنا (ليست لأغراض أمنية).
function uniqueSuffix(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function e2eSlug(label: string): string {
  return `${E2E_PREFIX}-${getRunId()}-${label}-${uniqueSuffix()}`;
}

export function e2eName(label: string): string {
  return `E2E ${label} ${getRunId()}-${uniqueSuffix()}`;
}

// اللقب (customerLastName) هو الحقل الذي يُستعمل لوسم كل الطلبات/الـLeads التجريبية —
// حقل نصي حر بلا قيود صيغة، خلافًا لرقم الهاتف. كل تنظيف بيانات يبحث عنه بـLIKE.
export const E2E_LAST_NAME_TAG = "E2E-TestRun";

// فريد فكل استدعاء (وليس ثابتًا طوال التشغيل) — الاسم الكامل (الأول + اللقب) يدخل فحساب
// محدِّد معدّل الطلبات بحسب الاسم (checkOrderRateLimit → rateLimitByName)؛ لقب ثابت لكل
// الطلبات فنفس التشغيل كان يُصادف حد "نفس الاسم" (429) بعد بضعة طلبات فقط. البادئة
// المشتركة (E2E_LAST_NAME_TAG) تبقى كما هي حتى يستمر تنظيف البيانات بـLIKE يطابقها.
export function e2eLastName(): string {
  return `${E2E_LAST_NAME_TAG}-${getRunId()}-${uniqueSuffix()}`;
}

// نطاق أرقام هاتف مخصَّص للاختبارات فقط (0555xxxxxx) — يطابق صيغة الهاتف الجزائرية المطلوبة
// (0[5-7][0-9]{8}) لكنه ضمن مجال لن يصطدم برقم زبون حقيقي. كل رقم فريد داخل التشغيل الواحد
// لتفادي عتبات تحديد المعدّل (rate limit) المفروضة على تكرار نفس الرقم.
export function e2ePhone(): string {
  const digits = Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0");
  return `0555${digits}`;
}

// محدِّد معدّل الطلبات الحقيقي (checkOrderRateLimit) يُصنِّف حسب deviceFingerprint إن
// وُجد، وإلا يقع الجميع فسلة IP الواحدة (127.0.0.1 محليًا) — 3 طلبات فقط لكل 10 دقائق
// افتراضيًا فبيانات الإنتاج الحالية. طلبات API المباشرة (لا تمر بمتصفح حقيقي يولّد
// visitorId تلقائيًا) يجب أن تُرسل واحدًا فريدًا صراحةً هنا، تمامًا كما يفعل عميل حقيقي،
// وإلا تصطدم اختبارات API المتتالية بحد "نفس الجهاز" الحقيقي بلا علاقة بما تختبره فعليًا.
export function e2eVisitorId(): string {
  return `e2e-visitor-${uniqueSuffix()}`;
}
