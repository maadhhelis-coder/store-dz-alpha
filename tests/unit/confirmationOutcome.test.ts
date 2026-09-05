import { describe, it, expect } from "vitest";
import { outcomeAction, FOLLOW_UP_OUTCOMES, RISK_SORT_RANK } from "@/server/modules/confirmation/outcomeMapping";
import type { ConfirmationOutcome } from "@prisma/client";

// الخريطة الحتمية نتيجة→إجراء (Corrections 3/11) — كل نتيجة لها إجراء واحد معروف؛
// النتائج ليست حالات طلب أبدًا.

describe("outcomeAction", () => {
  it("confirmed → انتقال confirmed", () => {
    expect(outcomeAction("confirmed")).toEqual({ kind: "transition", to: "confirmed" });
  });

  it("no_answer وcall_back → الطلب يبقى pending مع جدولة إعادة", () => {
    expect(outcomeAction("no_answer")).toEqual({ kind: "stay_pending", scheduleFollowUp: true });
    expect(outcomeAction("call_back")).toEqual({ kind: "stay_pending", scheduleFollowUp: true });
  });

  it("customer_requested_change → pending بلا جدولة إلزامية", () => {
    expect(outcomeAction("customer_requested_change")).toEqual({ kind: "stay_pending", scheduleFollowUp: false });
  });

  it("wrong_number/cancelled/duplicate → انتقالات نهائية", () => {
    expect(outcomeAction("wrong_number")).toEqual({ kind: "transition", to: "wrong_number" });
    expect(outcomeAction("cancelled")).toEqual({ kind: "transition", to: "cancelled" });
    expect(outcomeAction("duplicate")).toEqual({ kind: "transition", to: "duplicate" });
  });

  it("fraud_suspected → انتقال + مهمة مراجعة يدوية", () => {
    expect(outcomeAction("fraud_suspected")).toEqual({
      kind: "transition_with_task",
      to: "fraud_suspected",
      taskType: "manual_review",
    });
  });

  it("لا تُنتج أي نتيجة حالة no_answer/callback/voicemail إطلاقًا", () => {
    const allOutcomes: ConfirmationOutcome[] = [
      "confirmed", "no_answer", "call_back", "wrong_number", "cancelled",
      "duplicate", "fraud_suspected", "customer_requested_change",
    ];
    for (const outcome of allOutcomes) {
      const action = outcomeAction(outcome);
      if (action.kind === "transition" || action.kind === "transition_with_task") {
        expect(["no_answer", "callback", "voicemail"]).not.toContain(action.to);
      }
    }
  });
});

describe("FOLLOW_UP_OUTCOMES", () => {
  it("هي بالضبط no_answer وcall_back", () => {
    expect(FOLLOW_UP_OUTCOMES).toEqual(["no_answer", "call_back"]);
  });
});

describe("RISK_SORT_RANK", () => {
  it("very_high أولًا ثم high ثم medium ثم low", () => {
    expect(RISK_SORT_RANK.very_high).toBeGreaterThan(RISK_SORT_RANK.high);
    expect(RISK_SORT_RANK.high).toBeGreaterThan(RISK_SORT_RANK.medium);
    expect(RISK_SORT_RANK.medium).toBeGreaterThan(RISK_SORT_RANK.low);
  });
});
