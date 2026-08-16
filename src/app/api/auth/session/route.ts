import { NextResponse } from "next/server";
import { requireAdmin, UnauthorizedError } from "@/lib/auth/requireAdmin";

export async function GET() {
  try {
    const admin = await requireAdmin();
    return NextResponse.json({
      user: { id: admin.id, email: admin.email, fullName: admin.fullName, role: admin.role },
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("session error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}
