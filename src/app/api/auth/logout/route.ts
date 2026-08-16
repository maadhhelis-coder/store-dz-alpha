import { NextResponse } from "next/server";
import { logoutAdmin } from "@/server/services/authService";

export async function POST() {
  await logoutAdmin();
  return NextResponse.json({ ok: true });
}
