import { config } from "dotenv";

// إعداد اختبارات التكامل — يُشغَّل قبل أي استيراد لملفات الاختبار نفسها، فأي
// وحدة تُستورد لاحقًا (وتستورِد prisma singleton) ترى قاعدة الاختبار حصرًا.
// TEST_DATABASE_URL فقط يُقبَل هنا: بلا متغير صريح لا يُلمس أي عنوان اتصال،
// وكل الاختبارات تُتخطى (انظر skipBeforeAll في ملفات الاختبار) — لا سيناريو
// يوصل أي استعلام إلى قاعدة الإنتاج بحال.

if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
} else {
  console.warn(
    "[integration] TEST_DATABASE_URL غير مضبوط — ستُتخطى اختبارات التكامل. " +
      "مثال: TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/store_test npm run test:integration",
  );
}

// P4: القفل (jobLock) يحتاج بيانات Upstash. تُحمَّل بعد إسناد DATABASE_URL أعلاه،
// وdotenv لا يدهس متغيّرًا مضبوطًا مسبقًا — فقاعدة الاختبار تبقى هي المستعملة
// مهما كان DATABASE_URL داخل .env.local. غياب مفاتيح Upstash يُفشل اختبارات
// الأقفال بصوت واضح بدل تخطي القفل صامتًا (لا تعطيل لضابط تزامن أبدًا).
config({ path: ".env.local" });
