import { prisma } from "@/server/db/prisma";

export function findWilayaByCode(code: number) {
  return prisma.wilaya.findUnique({ where: { code } });
}

export function listActiveWilayas() {
  return prisma.wilaya.findMany({ where: { isActive: true }, orderBy: { code: "asc" } });
}

export function listAllWilayas() {
  return prisma.wilaya.findMany({ orderBy: { code: "asc" } });
}

// مدى سعر التوصيل الفعلي عبر الولايات المفعّلة — يُعلَن في بيانات Google المنظَّمة
// (shippingDetails). يُقرأ من القاعدة لا يُكتب ثابتًا، لأن صاحب المتجر يعدّل هذه الأسعار
// من لوحة التحكم فتصبح أي قيمة ثابتة كذبًا بعد أول تعديل.
export async function getDeliveryPriceRange(): Promise<{ minDzd: number; maxDzd: number }> {
  const [office, home] = await Promise.all([
    prisma.wilaya.aggregate({ where: { isActive: true }, _min: { officePriceDzd: true } }),
    prisma.wilaya.aggregate({ where: { isActive: true }, _max: { homePriceDzd: true } }),
  ]);
  return {
    minDzd: office._min.officePriceDzd ?? 0,
    maxDzd: home._max.homePriceDzd ?? 0,
  };
}

export type WilayaPricingUpdate = {
  code: number;
  officePriceDzd: number | null;
  homePriceDzd: number;
  isActive: boolean;
};

export async function bulkUpdateWilayaPricing(updates: WilayaPricingUpdate[]) {
  await prisma.$transaction(
    updates.map((u) =>
      prisma.wilaya.update({
        where: { code: u.code },
        data: {
          officePriceDzd: u.officePriceDzd,
          homePriceDzd: u.homePriceDzd,
          isActive: u.isActive,
        },
      }),
    ),
  );
}
