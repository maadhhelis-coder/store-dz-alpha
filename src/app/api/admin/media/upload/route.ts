import { NextResponse } from "next/server";
import { UnauthorizedError, ForbiddenError } from "@/lib/auth/requireAdmin";
import { requirePermission } from "@/lib/auth/requirePermission";
import { getSupabaseAdmin, PRODUCT_IMAGES_BUCKET, SupabaseConfigError } from "@/lib/supabaseAdminClient";
import { matchesImageMagicBytes } from "@/lib/validateImageMagicBytes";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
// 4MB وليس 5: منصّة النشر ترفض جسم الطلب فوق 4.5MB بنفسها وتردّ صفحة خطأ
// ليست JSON، فيسقط res.json() فالمتصفح ولا يرى صاحب المتجر أي سبب. الحدّ هنا أقلّ
// من حدّ المنصّة ليبقى الرفض دائمًا من كودنا برسالة عربية مفهومة.
const MAX_SIZE_BYTES = 4 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    await requirePermission("products.manage");

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "لم يتم إرفاق أي ملف" }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "نوع الملف غير مدعوم (jpeg/png/webp فقط)" }, { status: 400 });
    }
    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: "حجم الملف كبير جدًا (الحد الأقصى 4MB)" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    if (!matchesImageMagicBytes(file.type, arrayBuffer)) {
      return NextResponse.json({ error: "محتوى الملف لا يطابق نوع الصورة المعلن" }, { status: 400 });
    }

    const extension = file.type.split("/")[1];
    const path = `misc/${crypto.randomUUID()}.${extension}`;
    const supabaseAdmin = getSupabaseAdmin();

    const { error: uploadError } = await supabaseAdmin.storage
      .from(PRODUCT_IMAGES_BUCKET)
      .upload(path, arrayBuffer, { contentType: file.type, upsert: false });

    if (uploadError) {
      console.error("storage upload error", uploadError);
      return NextResponse.json({ error: "فشل رفع الصورة" }, { status: 500 });
    }

    const { data: publicUrlData } = supabaseAdmin.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(path);

    return NextResponse.json({ url: publicUrlData.publicUrl }, { status: 201 });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    // نقص إعداد بيئة ⇒ 503 برسالة تدلّ على مكان الإصلاح، لا 500 مبهم.
    if (error instanceof SupabaseConfigError) {
      console.error("supabase config error", error.message);
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error("upload media error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}
