import { NextResponse } from "next/server";
import { requireAdmin, UnauthorizedError } from "@/lib/auth/requireAdmin";
import { funnelCreateSchema } from "@/lib/validation/funnelSchema";
import {
  listFunnels,
  createFunnel,
  FunnelSlugTakenError,
  InsufficientBulletsError,
  ProductNotPublishedError,
} from "@/server/services/funnelsService";

export async function GET(request: Request) {
  try {
    await requireAdmin();

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? 20)));
    const search = searchParams.get("search") ?? undefined;

    const result = await listFunnels({ page, pageSize, search });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("list funnels error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = await request.json().catch(() => null);
    const parsed = funnelCreateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "بيانات صفحة الهبوط غير صحيحة", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const funnel = await createFunnel(parsed.data);
    return NextResponse.json({ funnel }, { status: 201 });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof FunnelSlugTakenError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof InsufficientBulletsError || error instanceof ProductNotPublishedError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("create funnel error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}
