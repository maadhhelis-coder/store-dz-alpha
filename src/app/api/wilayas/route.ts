import { NextResponse } from "next/server";
import { listActiveWilayas } from "@/server/repositories/wilayasRepository";

// عام (بلا مصادقة) — يُستعمل من نموذج الطلب في الموقع ليعرض أسعار التوصيل الحقيقية التي
// يضبطها صاحب المتجر من لوحة التحكم، بدل نسخة ثابتة قد تختلف عنها. يُرجع فقط الولايات
// المفعّلة (isActive) حتى لا يقدر الزبون يطلب لولاية عطّلها صاحب المتجر.
export async function GET() {
  try {
    const wilayas = await listActiveWilayas();
    return NextResponse.json({
      wilayas: wilayas.map((w) => ({
        code: w.code,
        name: w.name,
        officePriceDzd: w.officePriceDzd,
        homePriceDzd: w.homePriceDzd,
      })),
    });
  } catch (error) {
    console.error("public wilayas list error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}
