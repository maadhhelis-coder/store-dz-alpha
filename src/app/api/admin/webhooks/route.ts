import { NextResponse } from "next/server";
import { requireAdmin, ForbiddenError, UnauthorizedError } from "@/lib/auth/requireAdmin";
import { requireOwnerOrApiKey } from "@/lib/auth/requireAdminOrApiKey";
import { webhookCreateSchema } from "@/lib/validation/webhookSchema";
import { listWebhooksPage, createWebhook, PrivateWebhookHostError, WebhookUrlTakenError } from "@/server/services/webhooksService";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? 20)));

    const result = await listWebhooksPage({ page, pageSize });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("list webhooks error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requireOwnerOrApiKey(request, "webhooks:write");
    const body = await request.json().catch(() => null);
    const parsed = webhookCreateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "بيانات غير صحيحة", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { webhook, rawSecret } = await createWebhook(parsed.data.url, parsed.data.events);
    // rawSecret يُعاد هنا فقط، مرة واحدة — لن يُعاد أبدًا فأي استجابة لاحقة (GET/list).
    return NextResponse.json({ webhook, secret: rawSecret }, { status: 201 });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof PrivateWebhookHostError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof WebhookUrlTakenError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("create webhook error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}
