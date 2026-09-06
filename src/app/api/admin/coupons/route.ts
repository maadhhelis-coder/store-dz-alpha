import { NextResponse } from "next/server";
import { UnauthorizedError, ForbiddenError } from "@/lib/auth/requireAdmin";
import { requirePermission } from "@/lib/auth/requirePermission";
import { couponCreateSchema } from "@/lib/validation/couponSchema";
import { listCouponsPage, createCoupon, DuplicateCouponCodeError, InvalidCouponError } from "@/server/services/couponsService";

export async function GET(request: Request) {
  try {
    await requirePermission("products.read");
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? 20)));

    const result = await listCouponsPage({ page, pageSize });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("list coupons error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requirePermission("products.manage");
    const body = await request.json().catch(() => null);
    const parsed = couponCreateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "بيانات غير صحيحة", details: parsed.error.flatten() }, { status: 400 });
    }

    const coupon = await createCoupon(parsed.data);
    return NextResponse.json({ coupon }, { status: 201 });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof DuplicateCouponCodeError || error instanceof InvalidCouponError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("create coupon error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}
