import { NextResponse } from "next/server";
import { UnauthorizedError, ForbiddenError } from "@/lib/auth/requireAdmin";
import { requireAdminOrApiKey } from "@/lib/auth/requireAdminOrApiKey";
import { getCatalogExtras } from "@/server/modules/mcp/catalogExtras";

// العروض النشطة والكوبونات الصالحة — للوكيل الذكي (x-api-key بنطاق products:read)
// حتى يعرف كل ما في المتجر لا المنتجات فقط.
export async function GET(request: Request) {
  try {
    await requireAdminOrApiKey(request, "products:read");
    return NextResponse.json(await getCatalogExtras(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
    console.error("catalog extras error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}
