import type { Coupon } from "@prisma/client";

// منطق قواعد الكوبون المشترك بين couponsService.validateCoupon (التحقق العام عبر
// /api/coupons/validate) وordersService.createOrder (التحقق داخل معاملة إنشاء الطلب) —
// كانا يكرران نفس الشروط الأربعة بنسختين قد تنحرفان عن بعض مع الوقت.
export class InvalidCouponError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidCouponError";
  }
}

export function assertCouponUsable(coupon: Coupon, subtotalDzd: number): void {
  if (!coupon.isActive) throw new InvalidCouponError("كود الخصم غير صالح");
  if (coupon.expiresAt && coupon.expiresAt.getTime() < Date.now()) {
    throw new InvalidCouponError("كود الخصم منتهي الصلاحية");
  }
  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
    throw new InvalidCouponError("تم استنفاد عدد مرات استخدام هذا الكوبون");
  }
  if (coupon.minOrderDzd !== null && subtotalDzd < coupon.minOrderDzd) {
    throw new InvalidCouponError(`هذا الكوبون يتطلب حد أدنى للطلب قدره ${coupon.minOrderDzd} دج`);
  }
}

export function computeCouponDiscountDzd(coupon: Coupon, subtotalDzd: number): number {
  const raw = coupon.type === "percentage" ? Math.round((subtotalDzd * coupon.value) / 100) : coupon.value;
  return Math.min(raw, subtotalDzd);
}
