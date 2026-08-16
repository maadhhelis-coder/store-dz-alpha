import { NextResponse } from "next/server";
import { requireAdmin, requireOwner, ForbiddenError, UnauthorizedError } from "@/lib/auth/requireAdmin";
import { funnelUpdateSchema } from "@/lib/validation/funnelSchema";
import {
  getFunnel,
  updateFunnel,
  deleteFunnel,
  FunnelNotFoundError,
  FunnelSlugTakenError,
  InsufficientBulletsError,
  ProductNotPublishedError,
} from "@/server/services/funnelsService";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    await requireAdmin();
    const { id } = await params;
    const funnel = await getFunnel(id);
    return NextResponse.json({ funnel });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof FunnelNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error("get funnel error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    await requireAdmin();
    const { id } = await params;
    const body = await request.json().catch(() => null);
    const parsed = funnelUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "بيانات صفحة الهبوط غير صحيحة", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const funnel = await updateFunnel(id, parsed.data);
    return NextResponse.json({ funnel });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof FunnelNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof FunnelSlugTakenError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof InsufficientBulletsError || error instanceof ProductNotPublishedError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("update funnel error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    await requireOwner();
    const { id } = await params;
    await deleteFunnel(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof FunnelNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error("delete funnel error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}
