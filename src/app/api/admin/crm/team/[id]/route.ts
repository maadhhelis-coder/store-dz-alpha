import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/requirePermission";
import { p8ErrorResponse } from "@/lib/p8RouteErrors";
import { teamUpdateSchema } from "@/lib/validation/teamSchema";
import { updateTeamMember } from "@/server/modules/team/teamService";

const paramsSchema = z.object({ id: z.string().uuid() });

// تعديل دور/حالة/اسم عضو — users.manage؛ القواعد (لا ذات، لا آخر مالك...) في الخدمة.
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requirePermission("users.manage");
    const params = paramsSchema.safeParse(await context.params);
    if (!params.success) return NextResponse.json({ error: "معرّف غير صحيح" }, { status: 400 });
    const parsed = teamUpdateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "بيانات غير صحيحة", details: parsed.error.flatten() }, { status: 400 });
    const { reason, ...patch } = parsed.data;
    return NextResponse.json({ member: await updateTeamMember({ id: params.data.id, actor: admin, patch, reason }) });
  } catch (error) {
    return p8ErrorResponse(error, "team update");
  }
}
