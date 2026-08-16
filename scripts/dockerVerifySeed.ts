import { prisma } from "../src/server/db/prisma";
import { ensureAdminFixtures } from "../tests/e2e/support/adminFixtures";

// يُشغَّل مرة واحدة داخل خدمة "migrate" (docker-compose.yml) بعد prisma migrate deploy +
// seed.ts العادي — يجهّز فقط ما يحتاجه التحقق الفعلي فdocker-verify.yml (تسجيل دخول حقيقي +
// إنشاء طلب حقيقي)، وليس جزءًا من seed.ts نفسه (الذي يبقى مقتصرًا على بيانات الإنتاج
// الأساسية: فئات وولايات). يعيد استعمال ensureAdminFixtures نفسها المُستعملة فE2E الحقيقي —
// حساب Owner/Staff فSupabase Auth موجود بالفعل (خارجي، مشترك)؛ هذا يضمن فقط وجود صف
// AdminUser المطابق فقاعدة بيانات Postgres المحلية (Docker) هذه تحديدًا.
async function main() {
  console.log("Ensuring E2E admin fixtures (owner/staff) exist in this database...");
  await ensureAdminFixtures();

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
