import { createSupabaseServerClient } from "@/lib/auth/supabaseServerClient";
import { findAdminByAuthUserId, touchLastLogin } from "@/server/repositories/adminUsersRepository";
import type { LoginInput } from "@/lib/validation/authSchema";

export class InvalidCredentialsError extends Error {
  constructor() {
    super("البريد الإلكتروني أو كلمة المرور غير صحيحة");
    this.name = "InvalidCredentialsError";
  }
}

export async function loginAdmin(input: LoginInput) {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });

  if (error || !data.user) {
    // نسجّل السبب الحقيقي من Supabase Auth (بيانات دخول فعلًا خاطئة، أم خطأ/حد معدّل داخلي
    // لدى Supabase نفسه) — الرسالة المعروضة للمستخدم تبقى عامة عمدًا (لا تُسرّب أي تفاصيل)،
    // لكن ابتلاع الخطأ الحقيقي بصمت هنا كان يمنع تشخيص أي فشل دخول حقيقي غير متوقع.
    console.error("loginAdmin: signInWithPassword failed", error?.message ?? "no data.user returned");
    throw new InvalidCredentialsError();
  }

  const adminUser = await findAdminByAuthUserId(data.user.id);

  if (!adminUser || !adminUser.isActive) {
    // نسجل خروج فورًا: عنده حساب Supabase صحيح لكن ماشي إداري مصرح له
    await supabase.auth.signOut();
    throw new InvalidCredentialsError();
  }

  await touchLastLogin(adminUser.id);

  return adminUser;
}

export async function logoutAdmin() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
}
