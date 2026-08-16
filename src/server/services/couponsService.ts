import * as couponsRepository from "@/server/repositories/couponsRepository";
import { assertCouponUsable, computeCouponDiscountDzd, InvalidCouponError } from "@/lib/validation/couponRules";
import type { CouponCreateInput, CouponUpdateInput } from "@/lib/validation/couponSchema";
import type { Coupon } from "@prisma/client";

export { InvalidCouponError };

export class CouponNotFoundError extends Error {
  constructor() {
    super("الكوبون غير موجود");
    this.name = "CouponNotFoundError";
  }
}

export class DuplicateCouponCodeError extends Error {
  constructor() {
    super("يوجد كوبون آخر بنفس الكود");
    this.name = "DuplicateCouponCodeError";
  }
}

export function listCoupons() {
  return couponsRepository.listCoupons();
}

export function listCouponsPage(params: couponsRepository.ListCouponsPageParams) {
  return couponsRepository.listCouponsPage(params);
}

export async function createCoupon(input: CouponCreateInput) {
  const existing = await couponsRepository.findCouponByCode(input.code);
  if (existing) throw new DuplicateCouponCodeError();

  if (input.type === "percentage" && input.value > 100) {
    throw new InvalidCouponError("نسبة الخصم يجب ألا تتجاوز 100%");
  }

  return couponsRepository.createCoupon({
    code: input.code,
    type: input.type,
    value: input.value,
    usageLimit: input.usageLimit,
    minOrderDzd: input.minOrderDzd,
    expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
  });
}

export async function updateCoupon(id: string, input: CouponUpdateInput) {
  return couponsRepository.updateCoupon(id, {
    ...input,
    expiresAt: input.expiresAt === undefined ? undefined : input.expiresAt ? new Date(input.expiresAt) : null,
  });
}

export function deleteCoupon(id: string) {
  return couponsRepository.deleteCoupon(id);
}

// تُستدعى داخل معاملة إنشاء الطلب — تتحقق من صلاحية الكوبون وترجع قيمة الخصم بالدج، بلا ما
// تزيد usedCount هنا — الزيادة الفعلية تتم داخل نفس معاملة إنشاء الطلب في ordersService.ts
// عبر updateMany مشروط بـ(usedCount < usageLimit)، لضمان عدم تجاوز الحد تحت التزامن.
export async function validateCoupon(code: string, subtotalDzd: number): Promise<{ coupon: Coupon; discountDzd: number }> {
  const coupon = await couponsRepository.findCouponByCode(code.trim().toUpperCase());
  if (!coupon) throw new InvalidCouponError("كود الخصم غير صالح");

  assertCouponUsable(coupon, subtotalDzd);
  return { coupon, discountDzd: computeCouponDiscountDzd(coupon, subtotalDzd) };
}

export async function getCoupon(id: string) {
  const coupon = await couponsRepository.findCouponById(id);
  if (!coupon) throw new CouponNotFoundError();
  return coupon;
}
