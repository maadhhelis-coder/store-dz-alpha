import { NextResponse } from "next/server";
import { z } from "zod";
import { UnauthorizedError, ForbiddenError } from "@/lib/auth/requireAdmin";
import { requirePermission } from "@/lib/auth/requirePermission";
import {
  getAllCrmSettings,
  setCrmSetting,
  UnknownCrmSettingKeyError,
} from "@/server/modules/settings/crmSettingsService";
import { CRM_SETTING_KEYS, isCrmSettingKey } from "@/lib/validation/crmSettingsSchema";

// إعدادات CRM التشغيلية — القراءة settings.read والكتابة settings.manage.
//
// كانت الخدمة كاملة وموثّقة (setCrmSetting يكتب audit قبل/بعد) وبلا أي مستدعٍ:
// لا مسار ولا شاشة. النتيجة أن كل عتبات التجزئة (P3) وأوزان المخاطر وعتبات
// الاحتيال (P4) كانت "من crm_settings" اسمًا بينما لا سبيل لتغييرها فعليًا —
// أي أنها افتراضات مجمّدة في الـschema. هذا المسار يصلها.
//
// القيم تُتحقَّق بـzod داخل الخدمة (parseCrmSettingValue) قبل أي كتابة، فقيمة
// تالفة تُرفض بـ400 ولا تصل القاعدة إطلاقًا.

const patchSchema = z.object({
  key: z.string().trim().min(1).max(100),
  value: z.unknown(),
});

export async function GET() {
  try {
    await requirePermission("settings.read");
    return NextResponse.json({ settings: await getAllCrmSettings(), keys: CRM_SETTING_KEYS });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("get crm settings error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const admin = await requirePermission("settings.manage");

    const body = await request.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "بيانات غير صحيحة", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    if (!isCrmSettingKey(parsed.data.key)) {
      return NextResponse.json(
        { error: `مفتاح إعداد غير معروف: ${parsed.data.key}`, code: "UNKNOWN_KEY" },
        { status: 400 },
      );
    }

    try {
      await setCrmSetting({
        key: parsed.data.key,
        value: parsed.data.value,
        actorId: admin.id,
        reason: "تعديل من لوحة الإعدادات",
      });
    } catch (error) {
      if (error instanceof UnknownCrmSettingKeyError) {
        return NextResponse.json({ error: error.message, code: "UNKNOWN_KEY" }, { status: 400 });
      }
      // فشل تحقق zod = قيمة تالفة من المستخدم لا عطل خادم
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { error: "قيمة الإعداد غير صالحة", details: error.flatten() },
          { status: 400 },
        );
      }
      throw error;
    }

    return NextResponse.json({ ok: true, settings: await getAllCrmSettings() });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("update crm setting error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}
