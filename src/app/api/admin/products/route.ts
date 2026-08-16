import { NextResponse } from "next/server";
import { requireAdmin, UnauthorizedError, ForbiddenError } from "@/lib/auth/requireAdmin";
import { requireAdminOrApiKey } from "@/lib/auth/requireAdminOrApiKey";
import { productCreateSchema } from "@/lib/validation/productSchema";
import { listProducts, createProduct } from "@/server/services/productsService";

export async function GET(request: Request) {
  try {
    await requireAdminOrApiKey(request, "products:read");

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? 20)));
    const search = searchParams.get("search") ?? undefined;
    const categoryId = searchParams.get("categoryId") ?? undefined;
    const inStockParam = searchParams.get("inStock");
    const isPublishedParam = searchParams.get("isPublished");

    const result = await listProducts({
      page,
      pageSize,
      search,
      categoryId,
      inStock: inStockParam !== null ? inStockParam === "true" : undefined,
      isPublished: isPublishedParam !== null ? isPublishedParam === "true" : undefined,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("list products error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = await request.json().catch(() => null);
    const parsed = productCreateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "بيانات المنتج غير صحيحة", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const product = await createProduct(parsed.data);
    return NextResponse.json({ product }, { status: 201 });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("create product error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}
