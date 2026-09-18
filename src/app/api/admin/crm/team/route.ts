import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/requirePermission";
import { p8ErrorResponse } from "@/lib/p8RouteErrors";
import { teamInviteSchema, teamListQuerySchema } from "@/lib/validation/teamSchema";
import { inviteTeamMember, listTeamMembers } from "@/server/modules/team/teamService";

// أعضاء الفريق — القراءة users.read، الدعوة users.manage (مالك فقط بالخريطة الافتراضية).

export async function GET(request: Request) {
  try {
    await requirePermission("users.read");
    const parsed = teamListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) return NextResponse.json({ error: "بيانات غير صحيحة", details: parsed.error.flatten() }, { status: 400 });
    return NextResponse.json({ members: await listTeamMembers(parsed.data) });
  } catch (error) {
    return p8ErrorResponse(error, "team list");
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requirePermission("users.manage");
    const parsed = teamInviteSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "بيانات غير صحيحة", details: parsed.error.flatten() }, { status: 400 });
    const result = await inviteTeamMember({ ...parsed.data, fullName: parsed.data.fullName ?? null, actor: admin });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return p8ErrorResponse(error, "team invite");
  }
}
