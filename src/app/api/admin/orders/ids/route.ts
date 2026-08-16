import { NextResponse } from "next/server";
import { UnauthorizedError, ForbiddenError } from "@/lib/auth/requireAdmin";
import { requireAdminOrApiKey } from "@/lib/auth/requireAdminOrApiKey";
import { listOrderIds } from "@/server/services/ordersService";
import type { OrderStatus } from "@prisma/client";

const VALID_STATUSES: OrderStatus[] = [
  "pending",
  "confirmed",
  "no_answer",
  "callback",
  "voicemail",
  "fake",
  "wrong_number",
  "duplicate",
  "cancelled",
  "shipped",
  "delivered",
];

// يُرجع معرّفات كل الطلبات المطابقة للفلتر (بلا تقسيم صفحات) — تخدم زر "تحديد الكل"
// الجماعي فجدول الطلبات، الذي كان يقتصر سابقًا على الطلبات المعروضة بالصفحة الحالية فقط.
export async function GET(request: Request) {
  try {
    await requireAdminOrApiKey(request, "orders:read");

    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get("status");
    const status = statusParam && VALID_STATUSES.includes(statusParam as OrderStatus)
      ? (statusParam as OrderStatus)
      : undefined;
    const wilayaCodeParam = searchParams.get("wilayaCode");
    const wilayaCode = wilayaCodeParam ? Number(wilayaCodeParam) : undefined;
    const search = searchParams.get("search") ?? undefined;

    const result = await listOrderIds({ status, wilayaCode, search });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("list order ids error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}
