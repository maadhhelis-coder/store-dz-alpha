import { NextResponse } from "next/server";
import { requireAdmin, requireOwner, ForbiddenError, UnauthorizedError } from "@/lib/auth/requireAdmin";
import { offerUpdateSchema } from "@/lib/validation/offerSchema";
import {
  getOffer,
  updateOffer,
  deleteOffer,
  OfferNotFoundError,
  InvalidOfferError,
} from "@/server/services/offersService";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    await requireAdmin();
    const { id } = await params;
    const offer = await getOffer(id);
    return NextResponse.json({ offer });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof OfferNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error("get offer error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    await requireAdmin();
    const { id } = await params;
    const body = await request.json().catch(() => null);
    const parsed = offerUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "بيانات العرض غير صحيحة", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const offer = await updateOffer(id, parsed.data);
    return NextResponse.json({ offer });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof OfferNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof InvalidOfferError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("update offer error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    await requireOwner();
    const { id } = await params;
    await deleteOffer(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof OfferNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error("delete offer error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}
