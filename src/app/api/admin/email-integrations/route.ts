import { NextResponse } from "next/server";
import { requireAdmin, UnauthorizedError } from "@/lib/auth/requireAdmin";
import { listEmailIntegrations } from "@/server/services/emailIntegrationsService";

export async function GET() {
  try {
    await requireAdmin();
    const integrations = await listEmailIntegrations();
    return NextResponse.json({ integrations });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("list email integrations error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}
