import { prisma } from "../src/server/db/prisma";
import { ensureAdminFixtures } from "../tests/e2e/support/adminFixtures";

// يُشغَّل مرة واحدة داخل خدمة "migrate" (docker-compose.yml) بعد prisma migrate deploy +
// seed.ts العادي — يجهّز فقط ما يحتاجه التحقق الفعلي فdocker-verify.yml (تسجيل دخول حقيقي +
// إنشاء طلب حقيقي)، وليس جزءًا من seed.ts نفسه (الذي يبقى مقتصرًا على بيانات الإنتاج
// الأساسية: فئات وولايات). يعيد استعمال ensureAdminFixtures نفسها المُستعملة فE2E الحقيقي —
// حساب Owner/Staff فSupabase Auth موجود بالفعل (خارجي، مشترك)؛ هذا يضمن فقط وجود صف
// AdminUser المطابق فقاعدة بيانات Postgres المحلية (Docker) هذه تحديدًا.
//
// منتج الاختبار (لاختبار إنشاء الطلبات) لا يعتمد على Supabase إطلاقًا — يُزرَع دومًا. فقط
// حساب Owner (يحتاج Supabase Auth حقيقي خارجي) مشروط بوجود بيانات اعتماد حقيقية — هذا يمنع
// تسريب أسرار إنتاج حقيقية عبر GitHub Secrets العامة (راجع CRIT-01 فتقرير Deployment Audit)
// بينما يُبقي اختبار إنشاء الطلبات (لا يحتاج Supabase) يعمل دومًا بلا أي اعتماد خارجي.
async function main() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log("Ensuring E2E admin fixtures (owner/staff) exist in this database...");
    await ensureAdminFixtures();
  } else {
    console.log("Skipping admin fixtures: no Supabase credentials provided (real-login test will be skipped).");
  }

  console.log("Upserting docker-verify test product...");
  const category = await prisma.category.findUniqueOrThrow({ where: { slug: "electronics-gadgets" } });

  await prisma.product.upsert({
    where: { slug: "docker-verify-test-product" },
    update: {
      inStock: true,
      inventoryCount: 100,
      isPublished: true,
    },
    create: {
      slug: "docker-verify-test-product",
      name: "منتج اختبار Docker Verify",
      categoryId: category.id,
      priceDzd: 2500,
      shortDescription: "منتج مُنشأ آليًا لاختبار إنشاء الطلبات الفعلي داخل حاوية Docker.",
      longDescriptionHtml: "<p>هذا المنتج لأغراض التحقق الآلي فقط (docker-verify.yml).</p>",
      inStock: true,
      inventoryCount: 100,
      isPublished: true,
    },
  });

  console.log("Docker verify seed complete.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
