import { describe, it, expect } from "vitest";
import {
  isTransitionAllowed,
  assertTransition,
  InvalidTransitionError,
  LEGACY_READ_ONLY_STATUSES,
  TERMINAL_STATUSES,
} from "@/server/modules/orders/stateMachine";
import type { OrderStatus } from "@prisma/client";

// آلة حالات الطلب — تصحيح 10/3.16: انتقالات صريحة فقط؛ الحالات القديمة قراءة فقط؛
// كل انتقال غير مسموح يفشل بـINVALID_TRANSITION.

describe("المسار الرئيسي للحياة", () => {
  const happyPath: OrderStatus[] = [
    "pending",
    "confirmed",
    "preparing",
    "ready_to_ship",
    "shipped",
    "in_transit",
    "out_for_delivery",
    "delivered",
    "cod_collected",
  ];

  it("كل خطوة متتالية في المسار مسموحة", () => {
    for (let i = 0; i < happyPath.length - 1; i++) {
      expect(isTransitionAllowed(happyPath[i], happyPath[i + 1])).toBe(true);
    }
  });
});

describe("الانتقالات الاستثنائية", () => {
  it("confirmed→cancelled مسموح (تصحيح 55)", () => {
    expect(isTransitionAllowed("confirmed", "cancelled")).toBe(true);
  });

  it("preparing/ready_to_ship→cancelled مسموح", () => {
    expect(isTransitionAllowed("preparing", "cancelled")).toBe(true);
    expect(isTransitionAllowed("ready_to_ship", "cancelled")).toBe(true);
  });

  it("out_for_delivery→return_to_origin مسموح مع فتح دورة إرجاع", () => {
    expect(isTransitionAllowed("out_for_delivery", "return_to_origin")).toBe(true);
  });

  it("shipped/in_transit→return_to_origin مسموح", () => {
    expect(isTransitionAllowed("shipped", "return_to_origin")).toBe(true);
    expect(isTransitionAllowed("in_transit", "return_to_origin")).toBe(true);
  });

  it("return_to_origin→returned يغلق دورة RTO", () => {
    expect(isTransitionAllowed("return_to_origin", "returned")).toBe(true);
  });

  it("delivered→returned دورة إرجاع بعد التسليم", () => {
    expect(isTransitionAllowed("delivered", "returned")).toBe(true);
  });

  it("delivered→cod_collected فصل مالي", () => {
    expect(isTransitionAllowed("delivered", "cod_collected")).toBe(true);
  });

  it("fraud_suspected→cancelled|pending نتيجة مراجعة", () => {
    expect(isTransitionAllowed("fraud_suspected", "cancelled")).toBe(true);
    expect(isTransitionAllowed("fraud_suspected", "pending")).toBe(true);
  });

  it("pending→fraud_suspected مع فتح مراجعة", () => {
    expect(isTransitionAllowed("pending", "fraud_suspected")).toBe(true);
  });
});

describe("الانتقالات المحظورة", () => {
  it("returned→confirmed ممنوع — إعادة الشحن إجراء reship مخصص لا انتقال عام", () => {
    expect(isTransitionAllowed("returned", "confirmed")).toBe(false);
  });

  it("الحالات النهائية بلا خروج", () => {
    for (const terminal of TERMINAL_STATUSES) {
      for (const to of ["pending", "confirmed", "delivered", "cancelled"] as OrderStatus[]) {
        expect(isTransitionAllowed(terminal, to)).toBe(false);
      }
    }
  });

  it("لا قفزات كبيرة عبر دورة الحياة", () => {
    expect(isTransitionAllowed("pending", "shipped")).toBe(false);
    expect(isTransitionAllowed("pending", "delivered")).toBe(false);
    expect(isTransitionAllowed("confirmed", "delivered")).toBe(false);
    expect(isTransitionAllowed("confirmed", "shipped")).toBe(false);
    expect(isTransitionAllowed("preparing", "shipped")).toBe(false);
    expect(isTransitionAllowed("delivered", "shipped")).toBe(false);
  });

  it("لا تراجع للخلف عبر دورة الحياة", () => {
    expect(isTransitionAllowed("delivered", "confirmed")).toBe(false);
    expect(isTransitionAllowed("shipped", "pending")).toBe(false);
    expect(isTransitionAllowed("cod_collected", "delivered")).toBe(false);
  });

  it("نفس الحالة إلى نفسها غير مسموح (لا عملية فارغة)", () => {
    expect(isTransitionAllowed("pending", "pending")).toBe(false);
    expect(isTransitionAllowed("delivered", "delivered")).toBe(false);
  });
});

describe("الحالات القديمة (3.15/10)", () => {
  it("ممنوع أي كتابة جديدة إليها — قراءة فقط", () => {
    for (const legacy of LEGACY_READ_ONLY_STATUSES) {
      for (const from of ["pending", "confirmed", "shipped"] as OrderStatus[]) {
        expect(isTransitionAllowed(from, legacy)).toBe(false);
      }
    }
  });

  it("الصفوف التاريخية بها لا تخرج منها", () => {
    for (const legacy of LEGACY_READ_ONLY_STATUSES) {
      expect(isTransitionAllowed(legacy, "pending")).toBe(false);
      expect(isTransitionAllowed(legacy, "confirmed")).toBe(false);
    }
  });
});

describe("assertTransition", () => {
  it("يمرر الانتقال المشروع بصمت", () => {
    expect(() => assertTransition("pending", "confirmed")).not.toThrow();
  });

  it("يرمي InvalidTransitionError بكود INVALID_TRANSITION وتفاصيل from/to", () => {
    try {
      assertTransition("pending", "shipped");
      expect.unreachable("كان يجب أن يرمي");
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidTransitionError);
      const err = error as InvalidTransitionError;
      expect(err.code).toBe("INVALID_TRANSITION");
      expect(err.from).toBe("pending");
      expect(err.to).toBe("shipped");
    }
  });
});

describe("استثناء إعادة الشحن (P5)", () => {
  it("returned→confirmed مرفوض افتراضيًا لكل مستدعٍ", () => {
    expect(isTransitionAllowed("returned", "confirmed")).toBe(false);
    expect(() => assertTransition("returned", "confirmed")).toThrow(InvalidTransitionError);
  });

  it("يُسمح به فقط بعلم allowReship الصريح", () => {
    expect(isTransitionAllowed("returned", "confirmed", { allowReship: true })).toBe(true);
    expect(() => assertTransition("returned", "confirmed", { allowReship: true })).not.toThrow();
  });

  it("العلم لا يفتح أي انتقال آخر — استثناء واحد لا باب خلفي", () => {
    expect(isTransitionAllowed("returned", "shipped", { allowReship: true })).toBe(false);
    expect(isTransitionAllowed("cancelled", "confirmed", { allowReship: true })).toBe(false);
    expect(isTransitionAllowed("delivered", "confirmed", { allowReship: true })).toBe(false);
    expect(isTransitionAllowed("returned", "no_answer", { allowReship: true })).toBe(false);
  });
});
