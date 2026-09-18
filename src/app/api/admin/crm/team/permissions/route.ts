import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/requirePermission";
import { p8ErrorResponse } from "@/lib/p8RouteErrors";
import { rolePermissionPatchSchema } from "@/lib/validation/teamSchema";
import { getRoleMatrix, setRolePermission } from "@/server/modules/team/teamService";

// خريطة الأدوار ↔ الصلاحيات — القراءة users.read، التبديل users.manage (idempotent، موثّق).

export async function GET() {
  try {
    await requirePermission("users.read");
    return NextResponse.json(await getRoleMatrix());
  } catch (error) {
    return p8ErrorResponse(error, "role matrix");
  }
}

export async function PATCH(request: Request) {
  try {
    const admin = await requirePermission("users.manage");
    const parsed = rolePermissionPatchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "بيانات غير صحيحة", details: parsed.error.flatten() }, { status: 400 });
    const result = await setRolePermission({ ...parsed.data, actor: admin });
    return NextResponse.json({ ...result, matrix: await getRoleMatrix() });
  } catch (error) {
    return p8ErrorResponse(error, "role permission update");
  }
}
