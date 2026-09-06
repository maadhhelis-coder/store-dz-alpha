import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/auth/verifyCronSecret";
import { runJob } from "@/server/modules/jobs/jobRunner";
import { reconcileShipments } from "@/server/modules/shipping/reconciliation";

// مطابقة الشحن مع الناقل — يحل محل sync-dhd-status القديمة التي كانت تكتب حقلًا
// نصيًا خامًا على الطلب بلا سجل حدث ولا آلة حالات ولا كشف تباعد.
//
// محمي بـverifyCronSecret (fail-closed) + قفل Upstash داخل runJob: تشغيلان
// متزامنان ⇒ واحد فقط ينفّذ. كل نتيجة تُسجَّل في job_runs وintegration_sync_logs.

export const maxDuration = 60;

export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  try {
    const outcome = await runJob("shipment-reconcile", () => reconcileShipments());
    if (outcome.status === "skipped_locked") {
      return NextResponse.json({ ok: true, skipped: "locked" });
    }
    return NextResponse.json({ ok: true, ...outcome.result, durationMs: outcome.durationMs });
  } catch (error) {
    console.error("shipment-reconcile cron error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}
