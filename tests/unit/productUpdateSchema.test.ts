import { describe, expect, it } from "vitest";
import { productCreateSchema, productUpdateSchema } from "@/lib/validation/productSchema";

// خسارة بيانات حقيقية حدثت فعلًا فالإنتاج: كل ضغطة «حفظ التغييرات» كانت تمحو صور
// المنتج. السبب أن مخطط التحديث كان `productCreateSchema.partial()`، و`.partial()`
// تُبقي ZodDefault داخلها، فيصل `images: []` رغم أن ProductForm لا يرسل المفتاح
// أصلًا (الصور تُدار عبر مسار مستقل)، ويمرّ شرط `if (images)` فـupdateProduct
// فيحذف كل الصفوف بلا إعادة إنشاء. الدليل وقتها: 15 ملفًا فالمخزن مقابل صفر صفوف.

const BASE = {
  slug: "pack-douche-robinet",
  name: "منتج",
  categoryId: "e38dcb4b-7704-4abf-9a2b-c680d6600678",
  priceDzd: 2700,
  shortDescription: "وصف مختصر",
  longDescriptionHtml: "<p>وصف</p>",
};

describe("productUpdateSchema", () => {
  it("الحقل الغائب يبقى غائبًا — لا يتحوّل إلى قيمة افتراضية مدمِّرة", () => {
    // نفس حمولة ProductForm بالضبط: بلا مفتاح images إطلاقًا
    const parsed = productUpdateSchema.parse({ ...BASE, variants: [] });

    expect(parsed.images).toBeUndefined();
    // الشرط الحقيقي فـupdateProduct: `if (images)` — undefined لا يمرّ فلا حذف
    expect(Boolean(parsed.images)).toBe(false);
  });

  it("PATCH بحقل واحد لا يُصفّر أي حقل آخر", () => {
    const parsed = productUpdateSchema.parse({ priceDzd: 3000 });

    expect(parsed).toEqual({ priceDzd: 3000 });
    for (const key of ["inStock", "inventoryCount", "isPublished", "sortOrder", "variants", "howToUse"] as const) {
      expect(parsed[key]).toBeUndefined();
    }
  });

  it("المرسَل صراحةً يُحترم — بما فيه مصفوفة فارغة تعني «امسح»", () => {
    const parsed = productUpdateSchema.parse({ ...BASE, images: [] });
    expect(parsed.images).toEqual([]);
  });

  it("الإنشاء يحتفظ بالافتراضيات كما هي", () => {
    const parsed = productCreateSchema.parse(BASE);

    expect(parsed.images).toEqual([]);
    expect(parsed.variants).toEqual([]);
    expect(parsed.inStock).toBe(true);
    expect(parsed.inventoryCount).toBe(0);
    expect(parsed.isPublished).toBe(true);
  });
});
