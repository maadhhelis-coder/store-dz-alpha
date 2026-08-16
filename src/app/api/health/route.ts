import { NextResponse } from "next/server";
import { prisma } from "@/server/db/prisma";

// نقطة فحص صحة عامة (بلا مصادقة) لتُستعمل من HEALTHCHECK فDockerfile ومن أي مراقبة خارجية —
// تتحقق فعليًا من اتصال قاعدة البيانات (وليس فقط أن عملية Node حيّة) لأن حاوية "تعمل" لكن
// عاجزة عن الوصول لقاعدة البيانات ليست صحية فعليًا من منظور تشغيلي.
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok" }, { status: 200 });
  } catch (error) {
    console.error("health check: database unreachable", error);
    return NextResponse.json({ status: "error" }, { status: 503 });
  }
}
