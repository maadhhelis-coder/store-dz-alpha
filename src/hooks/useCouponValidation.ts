import { useEffect, useState } from "react";

export type CouponState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "valid"; code: string; discountDzd: number }
  | { status: "invalid"; message: string };

// resetKey: أي تغيّر فيه (المجموع الفرعي/العرض الإضافي) يُبطل كوبونًا صالحًا سابقًا حكمًا —
// خصم كان صالحًا لمجموع مختلف قد لا يطابق الحد الأدنى الجديد.
export function useCouponValidation(resetKey: string) {
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<CouponState>({ status: "idle" });

  useEffect(() => {
    // مزامنة ضرورية مع تغيّر خارجي (المجموع الفرعي) لا يمكن اشتقاقها فالعرض مباشرة بلا
    // فقدان قيمة كود الكوبون المكتوب — كوبون صالح سابقًا قد لا يطابق الحد الأدنى الجديد.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (coupon.status === "valid") setCoupon({ status: "idle" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  async function validateCoupon(code: string, subtotalDzd: number) {
    const trimmed = code.trim();
    if (!trimmed) return;
    setCoupon({ status: "checking" });
    try {
      const res = await fetch("/api/coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmed, subtotalDzd }),
      });
      const data = await res.json();
      if (res.ok && data.valid) {
        setCoupon({ status: "valid", code: trimmed.toUpperCase(), discountDzd: data.discountDzd });
      } else {
        setCoupon({ status: "invalid", message: data.error ?? "كود الخصم غير صالح" });
      }
    } catch {
      setCoupon({ status: "invalid", message: "تعذر التحقق من الكود، حاول من جديد" });
    }
  }

  return { couponInput, setCouponInput, coupon, setCoupon, validateCoupon };
}
