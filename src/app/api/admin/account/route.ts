import { NextResponse } from "next/server";
import { requireAdmin, UnauthorizedError } from "@/lib/auth/requireAdmin";
import { accountUpdateSchema } from "@/lib/validation/accountSchema";
import { createSupabaseServerClient } from "@/lib/auth/supabaseServerClient";
import { updateAdminFullName } from "@/server/repositories/adminUsersRepository";

export async function PATCH(request: Request) {
  try {
    const admin = await requireAdmin();
    const body = await request.json().catch(() => null);
    const parsed = accountUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "بيانات غير صحيحة", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { fullName, newPassword } = parsed.data;

    if (newPassword) {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        return NextResponse.json({ error: "تعذر تحديث كلمة المرور: " + error.message }, { status: 400 });
      }
    }

    if (fullName) {
      await updateAdminFullName(admin.id, fullName);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("update account error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}
