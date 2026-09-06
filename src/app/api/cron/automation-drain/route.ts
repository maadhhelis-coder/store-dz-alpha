import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/auth/verifyCronSecret";
import { runJob } from "@/server/modules/jobs/jobRunner";
import { drainOutbox, outboxHealth } from "@/server/modules/automation/outboxDrainer";

// تصريف صندوق الأحداث (outbox).
//
// كان المشغّل مكتوبًا بالكامل (قفل lease بـCAS، بوابة idempotency على
// automation_runs، منع السلاسل الدائرية، dead-letter مع SystemAlert) وبلا أي
// مستدعٍ: الأحداث تُكتب في domain_events ولا يصرّفها أحد. هذا المسار يصله.
//
// لا معالِجات مسجَّلة بعد (registerHandler ينتظر P7): الحدث يُعلَّم processed
// بلا عمل، فالتصريف اليوم يمنع تراكم pending ويثبت المسار جاهزًا. الجدولة
// اليومية تطابق بقية الـcrons؛ عند تسجيل أول معالِج تُشدَّد الجدولة وتُضاف
// دفعة فورية بعد الالتزام (after()) — لا داعي لهما قبل وجود عمل فعلي.

export const maxDuration = 60;

export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  try {
    const outcome = await runJob("automation-drain", async () => {
      const result = await drainOutbox();
      // صحة الصندوق بعد التصريف — تراكم dead-letter إشارة تشغيلية لا تُبتلع
      const health = await outboxHealth();
      return { ...result, ...health };
    });

    if (outcome.status === "skipped_locked") {
      return NextResponse.json({ ok: true, skipped: "locked" });
    }
    return NextResponse.json({ ok: true, ...outcome.result, durationMs: outcome.durationMs });
  } catch (error) {
    console.error("automation-drain cron error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}
