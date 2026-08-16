export type DeliveryOption = "office" | "home";

export type WilayaDelivery = {
  code: number;
  name: string;
  officePrice: number | null; // null = التوصيل للمكتب غير متوفر فهذه الولاية
  homePrice: number;
};

// أسعار التوصيل بالدينار الجزائري، حسب القائمة الحقيقية التي زوّدنا بها صاحب المتجر.
// ملاحظة: 3 ولايات غير مدرجة بعد (برج باجي مختار، عين قزام، جانت) — أضفها هنا لاحقًا بنفس الشكل.
export const wilayas: WilayaDelivery[] = [
  { code: 1, name: "أدرار", officePrice: 600, homePrice: 1100 },
  { code: 2, name: "الشلف", officePrice: 400, homePrice: 700 },
  { code: 3, name: "الأغواط", officePrice: 500, homePrice: 900 },
  { code: 4, name: "أم البواقي", officePrice: 400, homePrice: 700 },
  { code: 5, name: "باتنة", officePrice: 400, homePrice: 600 },
  { code: 6, name: "بجاية", officePrice: 400, homePrice: 700 },
  { code: 7, name: "بسكرة", officePrice: 500, homePrice: 750 },
  { code: 8, name: "بشار", officePrice: 600, homePrice: 1100 },
  { code: 9, name: "البليدة", officePrice: 350, homePrice: 600 },
  { code: 10, name: "البويرة", officePrice: 400, homePrice: 700 },
  { code: 11, name: "تمنراست", officePrice: 800, homePrice: 1300 },
  { code: 12, name: "تبسة", officePrice: 400, homePrice: 700 },
  { code: 13, name: "تلمسان", officePrice: 400, homePrice: 800 },
  { code: 14, name: "تيارت", officePrice: 400, homePrice: 800 },
  { code: 15, name: "تيزي وزو", officePrice: 400, homePrice: 700 },
  { code: 16, name: "الجزائر", officePrice: 350, homePrice: 500 },
  { code: 17, name: "الجلفة", officePrice: 500, homePrice: 700 },
  { code: 18, name: "جيجل", officePrice: 400, homePrice: 700 },
  { code: 19, name: "سطيف", officePrice: 400, homePrice: 650 },
  { code: 20, name: "سعيدة", officePrice: 400, homePrice: 800 },
  { code: 21, name: "سكيكدة", officePrice: 400, homePrice: 700 },
  { code: 22, name: "سيدي بلعباس", officePrice: 400, homePrice: 800 },
  { code: 23, name: "عنابة", officePrice: 400, homePrice: 700 },
  { code: 24, name: "قالمة", officePrice: 400, homePrice: 800 },
  { code: 25, name: "قسنطينة", officePrice: 400, homePrice: 700 },
  { code: 26, name: "المدية", officePrice: 400, homePrice: 700 },
  { code: 27, name: "مستغانم", officePrice: 400, homePrice: 700 },
  { code: 28, name: "المسيلة", officePrice: 400, homePrice: 650 },
  { code: 29, name: "معسكر", officePrice: 400, homePrice: 750 },
  { code: 30, name: "ورقلة", officePrice: 500, homePrice: 900 },
  { code: 31, name: "وهران", officePrice: 400, homePrice: 700 },
  { code: 32, name: "البيض", officePrice: 500, homePrice: 1000 },
  { code: 33, name: "إليزي", officePrice: 600, homePrice: 1300 },
  { code: 34, name: "برج بوعريريج", officePrice: 400, homePrice: 700 },
  { code: 35, name: "بومرداس", officePrice: 400, homePrice: 700 },
  { code: 36, name: "الطارف", officePrice: 400, homePrice: 800 },
  { code: 37, name: "تندوف", officePrice: 600, homePrice: 1300 },
  { code: 38, name: "تيسمسيلت", officePrice: 400, homePrice: 800 },
  { code: 39, name: "الوادي", officePrice: 500, homePrice: 650 },
  { code: 40, name: "خنشلة", officePrice: 400, homePrice: 600 },
  { code: 41, name: "سوق أهراس", officePrice: 500, homePrice: 700 },
  { code: 42, name: "تيبازة", officePrice: 400, homePrice: 700 },
  { code: 43, name: "ميلة", officePrice: 400, homePrice: 700 },
  { code: 44, name: "عين الدفلى", officePrice: 400, homePrice: 700 },
  { code: 45, name: "النعامة", officePrice: 500, homePrice: 1000 },
  { code: 46, name: "عين تموشنت", officePrice: 400, homePrice: 800 },
  { code: 47, name: "غرداية", officePrice: 500, homePrice: 900 },
  { code: 48, name: "غليزان", officePrice: 400, homePrice: 700 },
  { code: 49, name: "تيميمون", officePrice: 600, homePrice: 1300 },
  { code: 50, name: "برج باجي مختار", officePrice: 600, homePrice: 1300 },
  { code: 51, name: "أولاد جلال", officePrice: 300, homePrice: 500 },
  { code: 52, name: "بني عباس", officePrice: null, homePrice: 1300 },
  { code: 53, name: "عين صالح", officePrice: null, homePrice: 1300 },
  { code: 54, name: "عين قزام", officePrice: 800, homePrice: 1300 },
  { code: 55, name: "توقرت", officePrice: null, homePrice: 900 },
  { code: 56, name: "جانت", officePrice: 600, homePrice: 1300 },
  { code: 57, name: "المغير", officePrice: null, homePrice: 750 },
  { code: 58, name: "المنيعة", officePrice: 500, homePrice: 1000 },
];

export function getWilayaByCode(code: number): WilayaDelivery | undefined {
  return wilayas.find((w) => w.code === code);
}

export function getDeliveryPrice(
  wilayaCode: number,
  option: DeliveryOption,
): number | null {
  const wilaya = getWilayaByCode(wilayaCode);
  if (!wilaya) return null;
  return option === "office" ? wilaya.officePrice : wilaya.homePrice;
}
