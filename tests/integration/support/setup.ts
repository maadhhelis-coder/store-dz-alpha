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
