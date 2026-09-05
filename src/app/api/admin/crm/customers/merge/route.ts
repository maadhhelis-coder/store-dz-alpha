import { NextResponse } from "next/server";
import { z } from "zod";
import { UnauthorizedError, ForbiddenError } from "@/lib/auth/requireAdmin";
import { requirePermission } from "@/lib/auth/requirePermission";
import { mergeCustomers, CustomerMergeError } from "@/server/modules/customers/mergeService";

// دمج عميلين — customers.merge. الخدمة تتكفّل بالقفل التصاعدي والـmanifest
// والتوثيق (audit) وidempotency؛ الـroute طبقة نقل وترجمة أخطاء فقط.
//
// خريطة الحالات: تعارض حقيقي (هاتف، عميل غير نشط، سباق) = 409 حتمي — العميل
// لا يعيد المحاولة تلقائيًا على تعارض يحتاج قرارًا بشريًا.

const bodySchema = z.object({
  survivorId: z.string().uuid(),
  mergedId: z.string().uuid(),
  reason: z.string().trim().max(500).optional(),
  idempotencyKey: z.string().trim().min(8).max(200).optional(),
});

const CONFLICT_CODES = new Set([
  "SAME_CUSTOMER",
  "SURVIVOR_NOT_ACTIVE",
  "MERGED_NOT_ACTIVE",
  "PHONE_COLLISION",
]);

export async function POST(request: Request) {
  try {
    const admin = await requirePermission("customers.merge");
    const body = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "بيانات غير صحيحة", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const result = await mergeCustomers({
      survivorId: parsed.data.survivorId,
      mergedId: parsed.data.mergedId,
      actorId: admin.id,
      reason: parsed.data.reason ?? null,
      idempotencyKey: parsed.data.idempotencyKey ?? null,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof CustomerMergeError) {
      if (error.code === "NOT_FOUND") {
        return NextResponse.json({ error: error.message, code: error.code }, { status: 404 });
      }
      if (CONFLICT_CODES.has(error.code)) {
        return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
      }
      return NextResponse.json({ error: error.message, code: error.code }, { status: 422 });
    }
    console.error("customer merge error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}
