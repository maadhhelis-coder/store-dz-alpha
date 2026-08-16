import { NextResponse } from "next/server";
import { requireAdmin, UnauthorizedError } from "@/lib/auth/requireAdmin";
import { categoryCreateSchema } from "@/lib/validation/categorySchema";
import { listCategories, createCategory, DuplicateCategorySlugError } from "@/server/services/categoriesService";

export async function GET() {
  try {
    await requireAdmin();
    const categories = await listCategories();
    return NextResponse.json({ categories });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("list categories error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = await request.json().catch(() => null);
    const parsed = categoryCreateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "بيانات التصنيف غير صحيحة", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const category = await createCategory(parsed.data);
    return NextResponse.json({ category }, { status: 201 });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof DuplicateCategorySlugError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("create category error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}
