import { NextResponse } from "next/server";
import { requireAdmin, UnauthorizedError } from "@/lib/auth/requireAdmin";
import { getDhdCommunes, suggestDhdCommune, DhdNotConfiguredError } from "@/server/services/dhdService";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(request.url);
    const wilayaCode = Number(searchParams.get("wilayaCode"));
    const arabicCommune = searchParams.get("arabicCommune") ?? "";

    if (!Number.isInteger(wilayaCode) || wilayaCode < 1 || wilayaCode > 58) {
      return NextResponse.json({ error: "رمز ولاية غير صحيح" }, { status: 400 });
    }

    const communes = await getDhdCommunes(wilayaCode);
    const suggested = arabicCommune ? suggestDhdCommune(wilayaCode, arabicCommune, communes) : null;
    return NextResponse.json({ communes, suggested });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof DhdNotConfiguredError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof Error) {
      console.error("get DHD communes error", error);
      return NextResponse.json({ error: "تعذر الاتصال بخدمة التوصيل، حاول لاحقًا" }, { status: 502 });
    }
    console.error("get DHD communes error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}
