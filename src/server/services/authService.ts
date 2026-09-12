import { isAuthApiError } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/auth/supabaseServerClient";
import { findAdminByAuthUserId, touchLastLogin } from "@/server/repositories/adminUsersRepository";
import type { LoginInput } from "@/lib/validation/authSchema";

export class InvalidCredentialsError extends Error {
  constructor() {
    super("البريد الإلكتروني أو كلمة المرور غير صحيحة");
    this.name = "InvalidCredentialsError";
  }
}

// عطل عابر في Supabase Auth نفسه (انقطاع شبكة، 5xx، 429 من جهتهم، جسم خطأ فارغ) — ليس خطأ من
// المستخدم. اكتُشف فعليًا في CI: signInWithPassword ردّ بخطأ نصّه "{}" ببيانات دخول صحيحة، فعُرض
// «البريد أو كلمة المرور غير صحيحة» — رسالة مضلّلة تمنع إعادة المحاولة الصحيحة.
export class AuthUnavailableError extends Error {
  constructor() {
    super("خدمة تسجيل الدخول غير متاحة مؤقتًا — أعد المحاولة بعد لحظات");
    this.name = "AuthUnavailableError";
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
    // Supabase يرفض بيانات الدخول برد 4xx (invalid_credentials = 400)؛ أي شيء آخر عطل عابر.
    const rejected = !error || (isAuthApiError(error) && error.status < 429);
    throw rejected ? new InvalidCredentialsError() : new AuthUnavailableError();
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
