import { NextResponse } from "next/server";
import { requireAdmin, UnauthorizedError } from "@/lib/auth/requireAdmin";
import { getSupabaseAdmin, PRODUCT_IMAGES_BUCKET } from "@/lib/supabaseAdminClient";
import { matchesImageMagicBytes } from "@/lib/validateImageMagicBytes";
import { prisma } from "@/server/db/prisma";

type RouteParams = { params: Promise<{ id: string }> };

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request, { params }: RouteParams) {
  try {
    await requireAdmin();
    const { id: productId } = await params;

    // productId يُستعمل كـ prefix لمسار التخزين أدناه — تحقّق من صيغته أولًا بدل تمريره
    // كما هو، حتى لو لم يكن هناك مسار استغلال فعلي حاليًا (Supabase Storage ليس نظام ملفات).
    if (!UUID_PATTERN.test(productId)) {
      return NextResponse.json({ error: "معرّف منتج غير صحيح" }, { status: 400 });
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "لم يتم إرفاق أي ملف" }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "نوع الملف غير مدعوم (jpeg/png/webp فقط)" }, { status: 400 });
    }
    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: "حجم الملف كبير جدًا (الحد الأقصى 5MB)" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    if (!matchesImageMagicBytes(file.type, arrayBuffer)) {
      return NextResponse.json({ error: "محتوى الملف لا يطابق نوع الصورة المعلن" }, { status: 400 });
    }

    const extension = file.type.split("/")[1];
    const path = `${productId}/${crypto.randomUUID()}.${extension}`;
    const supabaseAdmin = getSupabaseAdmin();

    const { error: uploadError } = await supabaseAdmin.storage
      .from(PRODUCT_IMAGES_BUCKET)
      .upload(path, arrayBuffer, { contentType: file.type, upsert: false });

    if (uploadError) {
      console.error("storage upload error", uploadError);
      return NextResponse.json({ error: "فشل رفع الصورة" }, { status: 500 });
    }

    const { data: publicUrlData } = supabaseAdmin.storage
      .from(PRODUCT_IMAGES_BUCKET)
      .getPublicUrl(path);

    const lastImage = await prisma.productImage.findFirst({
      where: { productId },
      orderBy: { sortOrder: "desc" },
    });

    const image = await prisma.productImage.create({
      data: {
        productId,
        url: publicUrlData.publicUrl,
        sortOrder: (lastImage?.sortOrder ?? -1) + 1,
      },
    });

    return NextResponse.json({ image }, { status: 201 });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("upload product image error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}
