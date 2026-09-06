import { NextResponse } from "next/server";
import { UnauthorizedError, ForbiddenError } from "@/lib/auth/requireAdmin";
import { requirePermission } from "@/lib/auth/requirePermission";
import { listLeads } from "@/server/services/leadsService";
import type { LeadStatus } from "@prisma/client";

const VALID_STATUSES: LeadStatus[] = ["new", "contacted", "converted", "ignored"];

export async function GET(request: Request) {
  try {
    await requirePermission("marketing.read");

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? 20)));
    const statusParam = searchParams.get("status");
    const status = statusParam && VALID_STATUSES.includes(statusParam as LeadStatus)
      ? (statusParam as LeadStatus)
      : undefined;
    const search = searchParams.get("search") ?? undefined;

    const result = await listLeads({ page, pageSize, status, search });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("list leads error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}
