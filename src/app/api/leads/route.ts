import { NextResponse } from "next/server";
import { leadCreateSchema } from "@/lib/validation/leadSchema";
import { checkLeadRateLimit } from "@/server/services/rateLimitService";
import { createLead } from "@/server/services/leadsService";
import { getClientIp } from "@/lib/getClientIp";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = leadCreateSchema.safeParse(body);

  if (!parsed.success) {
    // بلا معلومات كافية — نتجاهل بهدوء، ماشي خطأ يستحق إزعاج الزائر
    return NextResponse.json({ ok: false }, { status: 200 });
  }

  const ip = getClientIp(request);
  const rateLimit = await checkLeadRateLimit(ip);
  if (!rateLimit.allowed) {
    return NextResponse.json({ ok: false }, { status: 200 });
  }

  try {
    await createLead(parsed.data, {
      ipAddress: ip,
      userAgent: request.headers.get("user-agent") ?? undefined,
    });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error("lead capture error", error);
    // فشل التقاط lead لا يجب أبدًا يكسر تجربة الزائر
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
