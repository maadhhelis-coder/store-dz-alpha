import { NextResponse } from "next/server";
import { requireAdmin, UnauthorizedError } from "@/lib/auth/requireAdmin";
import { getSupabaseAdmin, PRODUCT_IMAGES_BUCKET } from "@/lib/supabaseAdminClient";
import { prisma } from "@/server/db/prisma";

type RouteParams = { params: Promise<{ id: string; imageId: string }> };

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    await requireAdmin();
    const { imageId } = await params;
    const body = await request.json().catch(() => null);
    const sortOrder = Number(body?.sortOrder);

    if (!Number.isInteger(sortOrder) || sortOrder < 0) {
      return NextResponse.json({ error: "ترتيب غير صحيح" }, { status: 400 });
    }

    const image = await prisma.productImage.update({ where: { id: imageId }, data: { sortOrder } });
    return NextResponse.json({ image });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("update product image error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    await requireAdmin();
    const { imageId } = await params;

    const image = await prisma.productImage.delete({ where: { id: imageId } });

    // نحذف الملف الفعلي من التخزين أيضًا — بلا هذا يبقى يتيمًا للأبد (تكلفة تخزين متراكمة
    // بلا فائدة). نستخرج المسار الداخلي من الرابط العام (كل ما بعد /public/<bucket>/).
    const marker = `/public/${PRODUCT_IMAGES_BUCKET}/`;
    const markerIndex = image.url.indexOf(marker);
    if (markerIndex !== -1) {
      const storagePath = image.url.slice(markerIndex + marker.length);
      const { error: removeError } = await getSupabaseAdmin()
        .storage.from(PRODUCT_IMAGES_BUCKET)
        .remove([storagePath]);
      if (removeError) {
        // لا نُفشل الطلب بسبب هذا — سجل قاعدة البيانات حُذف فعلًا، وهذا ما يهم المستخدم؛
        // نسجّل الخطأ فقط لمتابعة أي ملفات يتيمة متبقية يدويًا لاحقًا إن تكرر.
        console.error("storage remove error on image delete", removeError);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("delete product image error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}
