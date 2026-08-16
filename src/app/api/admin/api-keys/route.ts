import { NextResponse } from "next/server";
import { requireAdmin, requireOwner, ForbiddenError, UnauthorizedError } from "@/lib/auth/requireAdmin";
import { apiKeyCreateSchema } from "@/lib/validation/apiKeySchema";
import { getApiKeys, generateApiKey } from "@/server/services/apiKeysService";

export async function GET() {
  try {
    await requireAdmin();
    const apiKeys = await getApiKeys();
    return NextResponse.json({ apiKeys });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("list api keys error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requireOwner();
    const body = await request.json().catch(() => null);
    const parsed = apiKeyCreateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "بيانات غير صحيحة", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const expiresAt = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null;
    const { rawKey, record } = await generateApiKey(parsed.data.label, parsed.data.scopes, expiresAt);
    return NextResponse.json({ rawKey, apiKey: record }, { status: 201 });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("create api key error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}
