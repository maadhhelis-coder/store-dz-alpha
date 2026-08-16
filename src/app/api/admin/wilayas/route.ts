import { NextResponse } from "next/server";
import { requireAdmin, requireOwner, UnauthorizedError, ForbiddenError } from "@/lib/auth/requireAdmin";
import { wilayaPricingUpdateSchema } from "@/lib/validation/wilayaSchema";
import { listWilayas, updateWilayaPricing } from "@/server/services/wilayasService";

export async function GET() {
  try {
    await requireAdmin();
    const wilayas = await listWilayas();
    return NextResponse.json({ wilayas });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("list wilayas error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}

// تعديل أسعار وتوصيل التوصيل شامل لكل الولايات — قرار مالي/تشغيلي على مستوى المتجر
// بأكمله (تسعير الشحن، تعطيل التوصيل لولاية بالكامل)، فيتطلب Owner لا Staff.
export async function PATCH(request: Request) {
  try {
    await requireOwner();
    const body = await request.json().catch(() => null);
    const parsed = wilayaPricingUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "بيانات غير صحيحة", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    await updateWilayaPricing(parsed.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("update wilayas error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}
