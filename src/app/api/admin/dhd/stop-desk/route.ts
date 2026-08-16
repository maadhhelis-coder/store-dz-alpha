import { NextResponse } from "next/server";
import { UnauthorizedError, ForbiddenError } from "@/lib/auth/requireAdmin";
import { requireAdminOrApiKey } from "@/lib/auth/requireAdminOrApiKey";
import { checkStopDeskAvailability, DhdNotConfiguredError } from "@/server/services/dhdService";

export async function GET(request: Request) {
  try {
    await requireAdminOrApiKey(request, "orders:read");
    const { searchParams } = new URL(request.url);
    const wilayaCode = Number(searchParams.get("wilayaCode"));
    const commune = searchParams.get("commune") ?? "";

    if (!Number.isInteger(wilayaCode) || wilayaCode < 1 || wilayaCode > 58) {
      return NextResponse.json({ error: "رمز ولاية غير صحيح" }, { status: 400 });
    }
    if (!commune.trim()) {
      return NextResponse.json({ error: "اسم البلدية مطلوب" }, { status: 400 });
    }

    const result = await checkStopDeskAvailability(wilayaCode, commune);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof DhdNotConfiguredError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof Error) {
      console.error("check stop desk error", error);
      return NextResponse.json({ error: "تعذر الاتصال بخدمة التوصيل، حاول لاحقًا" }, { status: 502 });
    }
    console.error("check stop desk error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}
