import { describe, it, expect } from "vitest";
import { hashIdempotentRequest } from "@/server/modules/idempotency/durableIdempotency";

// ثابت 3.4/62: بصمة الطلب حتمية — نفس المحتوى نفس hash حتى لو اختلفت لغة بناء
// الكائن؛ أي فرق في المحتوى (وليس الترتيب) ينتج hash مختلفًا.

describe("hashIdempotentRequest", () => {
  it("نفس المحتوى بنفس الترتيب → نفس hash", () => {
    const a = hashIdempotentRequest("order.create", { phone: "0555123456", quantity: 2 });
    const b = hashIdempotentRequest("order.create", { phone: "0555123456", quantity: 2 });
    expect(a).toBe(b);
  });

  it("نفس المحتوى بترتيب مفاتيح مختلف → نفس hash (ترتيب مستقر)", () => {
    const a = hashIdempotentRequest("order.create", { phone: "0555123456", quantity: 2 });
    const b = hashIdempotentRequest("order.create", { quantity: 2, phone: "0555123456" });
    expect(a).toBe(b);
  });

  it("أي فرق في القيم → hash مختلف (إعادة استعمال المفتاح تُرفض)", () => {
    const a = hashIdempotentRequest("order.create", { phone: "0555123456", quantity: 2 });
    const b = hashIdempotentRequest("order.create", { phone: "0555123456", quantity: 3 });
    expect(a).not.toBe(b);
  });

  it("أي فرق في المفاتيح → hash مختلف", () => {
    const a = hashIdempotentRequest("order.create", { phone: "0555123456" });
    const b = hashIdempotentRequest("order.create", { phone: "0555123456", coupon: null });
    expect(a).not.toBe(b);
  });

  it("العملية جزء من البصمة — نفس حمولة بعملية مختلفة يُرفض", () => {
    const a = hashIdempotentRequest("order.create", { id: "x" });
    const b = hashIdempotentRequest("shipment.create", { id: "x" });
    expect(a).not.toBe(b);
  });

  it("undefined يُسقط من البصمة لكن null يبقى (فرق دلالي)", () => {
    const a = hashIdempotentRequest("op", { a: 1, b: undefined });
    const b = hashIdempotentRequest("op", { a: 1 });
    const c = hashIdempotentRequest("op", { a: 1, b: null });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("مصفوفات متداخلة تحفظ الترتيب (الترتيب داخل المصفوفة دلالي)", () => {
    const a = hashIdempotentRequest("op", { items: [1, 2, 3] });
    const b = hashIdempotentRequest("op", { items: [3, 2, 1] });
    expect(a).not.toBe(b);
  });
});
