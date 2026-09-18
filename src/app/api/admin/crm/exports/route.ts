import { NextResponse } from "next/server";
import { requireAllPermissions } from "@/lib/auth/requirePermission";
import { p8ErrorResponse } from "@/lib/p8RouteErrors";
import { exportQuerySchema } from "@/lib/validation/teamSchema";
import { buildExport, EXPORT_ENTITIES, isExportEntity } from "@/server/modules/exports/exportsService";

// تصدير CSV — exports.create + صلاحية قراءة الكيان معًا. الحد export_max_rows؛
// التجاوز 413 صريح (لا اقتطاع). الملف يُبنى في الذاكرة (متزامن، محدود بالإعداد).
export async function GET(request: Request) {
  try {
    const parsed = exportQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) return NextResponse.json({ error: "بيانات غير صحيحة", details: parsed.error.flatten() }, { status: 400 });
    const { entity, ...filters } = parsed.data;
    if (!isExportEntity(entity)) return NextResponse.json({ error: `كيان تصدير غير معروف: ${entity}` }, { status: 400 });
    const admin = await requireAllPermissions(["exports.create", EXPORT_ENTITIES[entity]]);
    const result = await buildExport({ entity, filters, actor: admin });
    return new NextResponse(result.csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "X-Export-Rows": String(result.rows),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return p8ErrorResponse(error, "export");
  }
}
