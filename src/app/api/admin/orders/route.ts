import { NextResponse } from "next/server";
import { UnauthorizedError, ForbiddenError } from "@/lib/auth/requireAdmin";
import { requireAdminOrApiKey } from "@/lib/auth/requireAdminOrApiKey";
import { listOrders } from "@/server/services/ordersService";
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

export async function GET(request: Request) {
  try {
    await requireAdminOrApiKey(request, "orders:read");

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? 20)));
    const statusParam = searchParams.get("status");
    const status = statusParam && VALID_STATUSES.includes(statusParam as OrderStatus)
      ? (statusParam as OrderStatus)
      : undefined;
    const wilayaCodeParam = searchParams.get("wilayaCode");
    const wilayaCode = wilayaCodeParam ? Number(wilayaCodeParam) : undefined;
    const dateFromParam = searchParams.get("dateFrom");
    const dateToParam = searchParams.get("dateTo");
    const search = searchParams.get("search") ?? undefined;

    const result = await listOrders({
      page,
      pageSize,
      status,
      wilayaCode,
      dateFrom: dateFromParam ? new Date(dateFromParam) : undefined,
      dateTo: dateToParam ? new Date(dateToParam) : undefined,
      search,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("list orders error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}
