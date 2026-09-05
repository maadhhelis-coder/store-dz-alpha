import { NextResponse } from "next/server";
import { UnauthorizedError, ForbiddenError } from "@/lib/auth/requireAdmin";
import { requirePermission } from "@/lib/auth/requirePermission";
import { listCustomers } from "@/server/modules/customers/customerQueryService";
import { customerListQuerySchema } from "@/lib/validation/customerQuerySchema";

// قائمة العملاء — customers.read حصرًا. الترقيم من الخادم بسقف صارم، والترتيب
// حتمي (آخر طلب ثم id). الهواتف تُعاد مقنّعة دائمًا: لا حاجة للرقم الكامل في
// شاشة قائمة، ومن يحتاجه يفتح ملف العميل بصلاحيته.

export async function GET(request: Request) {
  try {
    await requirePermission("customers.read");
    const url = new URL(request.url);
    const parsed = customerListQuerySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "بيانات غير صحيحة", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const result = await listCustomers({
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      filters: {
        search: parsed.data.search ?? null,
        riskLevel: parsed.data.riskLevel ?? null,
        status: parsed.data.status ?? null,
        segment: parsed.data.segment ?? null,
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
    console.error("customers list error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}
