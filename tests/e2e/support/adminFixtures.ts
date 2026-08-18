import { createClient } from "@supabase/supabase-js";
import { testPrisma } from "./testPrisma";

// حسابا اختبار ثابتان (owner/staff) — دائمان بين تشغيلات الاختبارات (وليسا يُنشآن
// ويُحذفان فكل مرة) لتفادي حدود معدل إنشاء المستخدمين عند Supabase Auth، ولإعطاء بيانات
// دخول ثابتة يمكن التحقق منها يدويًا عند الحاجة. الإيميلان بنطاق .invalid المحجوز رسميًا
// (RFC 2606) لضمان عدم تعارضهما أبدًا مع بريد زبون حقيقي.
export const E2E_OWNER_EMAIL = "e2e-owner@storedz-test.invalid";
export const E2E_OWNER_PASSWORD = "E2E-Owner-Test-Pw-9f3a7c!";
export const E2E_STAFF_EMAIL = "e2e-staff@storedz-test.invalid";
export const E2E_STAFF_PASSWORD = "E2E-Staff-Test-Pw-2b8d1e!";

async function ensureAdminFixture(email: string, password: string, role: "owner" | "staff", label: string) {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const existing = await testPrisma.adminUser.findUnique({ where: { email } });
  if (existing) {
    // نتأكد أن الحساب لا يزال نشطًا وبنفس الدور المطلوب — إعادة ضبطهما احترازيًا لو عُدِّلا يدويًا.
    if (!existing.isActive || existing.role !== role) {
      await testPrisma.adminUser.update({ where: { id: existing.id }, data: { isActive: true, role } });
    }
    return { email, password };
  }

  // Supabase Auth: ننشئ المستخدم فقط لو لم يوجد بالفعل (قد يوجد فAuth بلا صف AdminUser
  // مطابق من محاولة سابقة فشلت جزئيًا — نتعامل مع الحالتين).
  //
  // اكتُشف فعليًا (تشخيص مباشر عبر curl خام + SDK، كلاهما يطابقان بعضهما تمامًا): تمرير
  // email_confirm:true ضمن جسم POST /auth/v1/admin/users على مشروع Supabase هذا يجعل
  // الخادم يُرجع استجابة GET /admin/users (قائمة فارغة) بدل إنشاء المستخدم فعليًا —
  // {"users":[],"aud":"authenticated"} — بصرف النظر عن SDK أو fetch خام. إزالة
  // email_confirm من جسم الإنشاء ينجح فورًا (يُرجع مستخدمًا حقيقيًا بمعرّف)، ثم نُأكّد
  // البريد فخطوة PUT منفصلة (updateUserById) تعمل بشكل طبيعي تمامًا.
  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
  });

  let authUserId = created?.user?.id;
  if (createError || !authUserId) {
    const { data: list } = await supabase.auth.admin.listUsers();
    const found = list?.users.find((u) => u.email === email);
    if (!found) throw new Error(`تعذّر إنشاء أو إيجاد حساب Supabase Auth لـ${label}: ${createError?.message}`);
    authUserId = found.id;
  } else {
    const { error: confirmError } = await supabase.auth.admin.updateUserById(authUserId, { email_confirm: true });
    if (confirmError) throw new Error(`تعذّر تأكيد بريد حساب Supabase Auth لـ${label}: ${confirmError.message}`);
  }

  await testPrisma.adminUser.create({
    data: { authUserId, email, fullName: `E2E ${label}`, role, isActive: true },
  });

  return { email, password };
}

export async function ensureAdminFixtures(): Promise<void> {
  await ensureAdminFixture(E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD, "owner", "Owner");
  await ensureAdminFixture(E2E_STAFF_EMAIL, E2E_STAFF_PASSWORD, "staff", "Staff");
}
