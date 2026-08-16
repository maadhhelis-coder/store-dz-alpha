import { NextResponse } from "next/server";
import { requireOwner, ForbiddenError, UnauthorizedError } from "@/lib/auth/requireAdmin";
import { emailProviderParamSchema, emailIntegrationCredentialsSchema } from "@/lib/validation/emailIntegrationSchema";
import { saveCredentials, disconnect } from "@/server/services/emailIntegrationsService";

export async function PATCH(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  try {
    await requireOwner();
    const { provider } = await params;
    const parsedProvider = emailProviderParamSchema.safeParse(provider);
    if (!parsedProvider.success) {
      return NextResponse.json({ error: "مزوّد غير معروف" }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    const parsed = emailIntegrationCredentialsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "بيانات غير صحيحة", details: parsed.error.flatten() }, { status: 400 });
    }

    const integration = await saveCredentials(parsedProvider.data, parsed.data.clientId, parsed.data.clientSecret);
    return NextResponse.json({ integration });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("save email integration credentials error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ provider: string }> }) {
  try {
    await requireOwner();
    const { provider } = await params;
    const parsedProvider = emailProviderParamSchema.safeParse(provider);
    if (!parsedProvider.success) {
      return NextResponse.json({ error: "مزوّد غير معروف" }, { status: 400 });
    }

    const integration = await disconnect(parsedProvider.data);
    return NextResponse.json({ integration });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("disconnect email integration error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}
