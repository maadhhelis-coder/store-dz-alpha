import { NextResponse } from "next/server";
import { requireAdmin, UnauthorizedError } from "@/lib/auth/requireAdmin";
import { adSpendCreateSchema } from "@/lib/validation/adSpendSchema";
import { listAdSpendEntries, createAdSpendEntry, DuplicateAdSpendEntryError } from "@/server/services/adSpendService";

export async function GET() {
  try {
    await requireAdmin();
    const entries = await listAdSpendEntries();
    return NextResponse.json({ entries });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("list ad spend error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = await request.json().catch(() => null);
    const parsed = adSpendCreateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "بيانات غير صحيحة", details: parsed.error.flatten() }, { status: 400 });
    }

    const entry = await createAdSpendEntry(parsed.data);
    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof DuplicateAdSpendEntryError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("create ad spend error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}
