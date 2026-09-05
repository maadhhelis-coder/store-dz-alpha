import { NextResponse } from "next/server";
import { z } from "zod";
import { UnauthorizedError, ForbiddenError } from "@/lib/auth/requireAdmin";
import { requirePermission } from "@/lib/auth/requirePermission";
import { getCustomer360 } from "@/server/modules/customers/customerQueryService";
import { customer360QuerySchema } from "@/lib/validation/customerQuerySchema";
import { METRIC_BASIS_LABELS } from "@/server/modules/metrics/definitions";

// ملف العميل الكامل (360) — customers.read. كل رقم مالي يأتي من
// metrics/definitions.ts عبر getCustomer360؛ لا حساب هنا. تُرفَق
// METRIC_BASIS_LABELS مع الرد كي يعرض كل مستهلك أساس الرقم نفسه بلا نسخ نصوص.

const paramsSchema = z.object({ id: z.string().uuid() });

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("customers.read");

    const rawParams = await context.params;
    const parsedParams = paramsSchema.safeParse(rawParams);
    if (!parsedParams.success) {
      return NextResponse.json({ error: "معرّف عميل غير صحيح" }, { status: 400 });
    }

    const url = new URL(request.url);
    const parsedQuery = customer360QuerySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: "بيانات غير صحيحة", details: parsedQuery.error.flatten() },
        { status: 400 },
      );
    }

    const result = await getCustomer360({
      customerId: parsedParams.data.id,
      timelineCursor: parsedQuery.data.timelineCursor ?? null,
    });
    if (!result) {
      return NextResponse.json({ error: "العميل غير موجود" }, { status: 404 });
    }

    return NextResponse.json({ ...result, metricBasisLabels: METRIC_BASIS_LABELS });
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
    console.error("customer 360 error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}
