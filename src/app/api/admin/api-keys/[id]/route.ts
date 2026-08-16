import { NextResponse } from "next/server";
import { requireOwner, ForbiddenError, UnauthorizedError } from "@/lib/auth/requireAdmin";
import { deactivateApiKey } from "@/server/services/apiKeysService";

type RouteParams = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    await requireOwner();
    const { id } = await params;
    await deactivateApiKey(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("revoke api key error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}
