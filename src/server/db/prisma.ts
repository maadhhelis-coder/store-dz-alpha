import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

declare global {
  var __prisma: PrismaClient | undefined;
}

function createPrismaClient() {
  // DATABASE_URL يشير لمُجمِّع اتصالات بوضع "transaction" (Supavisor/PgBouncer، منفذ 6543)
  // — يُضاعِف هذا المُجمِّع أصلًا اتصالات خلفية محدودة بين عملاء كثيرين، فتجمّع عميل كبير هنا
  // زائد عن الحاجة ويُخاطر باستنفاد حصة الاتصالات الخلفية الفعلية تحت حمل متزامن، خصوصًا مع
  // عمليتَي Node منفصلتَين (خادم التطبيق + عملية اختبارات E2E عبر testPrisma) تفتحان كل
  // واحدة تجمّعها الخاص ضد نفس المُجمِّع. اكتُشف هذا فعليًا: طلب /api/wilayas عالق بلا
  // استجابة ولا خطأ لعشرات الثوانٍ فتشغيلة E2E حقيقية، بتوقيت متّسق مع تراكم اتصالات لا مع
  // عطل عشوائي. max منخفض هنا يتماشى مع التوصية القياسية عند استعمال مُجمِّع transaction-mode.
  // onPoolError يُسجِّل أي خطأ مُجمِّع صراحةً بدل ابتلاعه صامتًا (لم يكن هناك أي تسجيل قبل هذا،
  // ما صعّب تشخيص المشكلة أعلاه فعليًا).
  const adapter = new PrismaPg(
    { connectionString: process.env.DATABASE_URL, max: 5 },
    { onPoolError: (err) => console.error("[prisma pool error]", err) },
  );
  return new PrismaClient({ adapter });
}

export const prisma = globalThis.__prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}
