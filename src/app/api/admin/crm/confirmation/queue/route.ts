import { NextResponse } from "next/server";
import { UnauthorizedError, ForbiddenError } from "@/lib/auth/requireAdmin";
import { requirePermission } from "@/lib/auth/requirePermission";
import { getConfirmationQueue } from "@/server/modules/confirmation/confirmationService";
import { queueQuerySchema } from "@/lib/validation/confirmationSchema";

// قائمة انتظار التأكيد — orders.read (عرض)؛ فلتر "طلباتي" عبر mine=true
// يستعمل هوية الجلسة (لا يُقبل agentId من العميل — منع تسريب إسناد الغير).

export async function GET(request: Request) {
  try {
    const admin = await requirePermission("orders.read");
    const url = new URL(request.url);
    const parsed = queueQuerySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) {
      return NextResponse.json({ error: "بيانات غير صحيحة", details: parsed.error.flatten() }, { status: 400 });
    }

    const result = await getConfirmationQueue({
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      assignedOnly: parsed.data.mine === true,
      agentId: admin.id,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
    console.error("confirmation queue error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}
