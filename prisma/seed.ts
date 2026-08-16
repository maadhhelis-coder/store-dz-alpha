import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";

import { wilayas } from "../src/data/delivery";

config({ path: ".env.local" });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// التصنيفات الابتدائية الثلاثة فقط — تُستعمل لتهيئة قاعدة بيانات فارغة جديدة. المنتجات
// لم تعد تُزرع من هنا: تُدار حصريًا عبر /admin/products الآن (نفس مصدر بيانات الموقع
// العام)، فلا داعي لنسخة ثابتة مكررة قد تنحرف عن الحقيقة الفعلية في القاعدة.
const seedCategories = [
  {
    slug: "electronics-gadgets",
    name: "إلكترونيات وغادجات",
    shortDescription: "أحدث الأجهزة الذكية والإكسسوارات التقنية",
    description:
      "تشكيلة مختارة من الأجهزة الإلكترونية والغادجات العملية التي تسهّل حياتك اليومية، من السماعات اللاسلكية إلى الساعات الذكية وإكسسوارات الشحن، كلها منتجات أصلية ومضمونة.",
    image: "/images/categories/electronics-gadgets.jpg",
    icon: "smartphone",
  },
  {
    slug: "fashion-accessories",
    name: "أزياء وإكسسوارات",
    shortDescription: "قطع أنيقة تكمّل إطلالتك اليومية",
    description:
      "مجموعة من الساعات والنظارات والحقائب والإكسسوارات العصرية المختارة بعناية لتناسب مختلف الأذواق والمناسبات، بجودة عالية وأسعار مدروسة.",
    image: "/images/categories/fashion-accessories.jpg",
    icon: "shirt",
  },
  {
    slug: "home-lifestyle",
    name: "منزل ولايف ستايل",
    shortDescription: "منتجات عملية تجعل يومك أسهل",
    description:
      "أدوات ومنتجات منزلية ذكية وعملية تساعدك على تنظيم وتحسين محيطك اليومي، مصممة لتجمع بين الفائدة والسعر المناسب.",
    image: "/images/categories/home-lifestyle.jpg",
    icon: "home",
  },
];

async function main() {
  console.log("Seeding categories...");
  for (const category of seedCategories) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      update: {
        name: category.name,
        shortDescription: category.shortDescription,
        description: category.description,
        imageUrl: category.image,
        icon: category.icon,
      },
      create: {
        slug: category.slug,
        name: category.name,
        shortDescription: category.shortDescription,
        description: category.description,
        imageUrl: category.image,
        icon: category.icon,
      },
    });
  }

  console.log("Seeding wilayas...");
  for (const w of wilayas) {
    await prisma.wilaya.upsert({
      where: { code: w.code },
      update: {
        name: w.name,
        officePriceDzd: w.officePrice,
        homePriceDzd: w.homePrice,
      },
      create: {
        code: w.code,
        name: w.name,
        officePriceDzd: w.officePrice,
        homePriceDzd: w.homePrice,
      },
    });
  }

  console.log("Seed complete.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
