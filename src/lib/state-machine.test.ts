import { describe, expect, it } from "vitest";

import {
  ApplicationTransitionError,
  canActorTransitionApplication,
  getAllowedApplicationTransitions,
  transitionApplication,
  validateApplicationTransition,
} from "@/lib/state-machine";
import type { EventApplication } from "@/lib/types";

const application: EventApplication = {
  id: "application-1",
  eventId: "event-1",
  userId: "user-1",
  status: "pending",
  appliedAt: "2026-07-18T09:00:00+09:00",
  updatedAt: "2026-07-18T09:00:00+09:00",
};

describe("application state machine", () => {
  it("대기 신청은 승인·거절·취소로만 전이할 수 있다", () => {
    expect(getAllowedApplicationTransitions("pending")).toEqual([
      "approved",
      "rejected",
      "cancelled",
    ]);
    expect(getAllowedApplicationTransitions("attended")).toEqual([]);
  });

  it("회원은 자신의 신청을 취소할 수 있지만 승인할 수 없다", () => {
    expect(
      canActorTransitionApplication("member", "pending", "cancelled"),
    ).toBe(true);
    expect(
      canActorTransitionApplication("member", "pending", "approved"),
    ).toBe(false);

    const validation = validateApplicationTransition(application, "approved", {
      actor: "member",
    });
    expect(validation).toMatchObject({
      valid: false,
      code: "FORBIDDEN_ACTOR",
    });
  });

  it("리더 승인 시 원본을 바꾸지 않고 승인 시각을 기록한다", () => {
    const now = "2026-07-18T11:30:00+09:00";

    const approved = transitionApplication(application, "approved", {
      actor: "leader",
      now,
    });

    expect(approved).not.toBe(application);
    expect(approved).toMatchObject({
      status: "approved",
      approvedAt: now,
      updatedAt: now,
    });
    expect(application.status).toBe("pending");
    expect(application.approvedAt).toBeUndefined();
  });

  it("거절 사유가 없으면 전이를 거부한다", () => {
    const validation = validateApplicationTransition(application, "rejected", {
      actor: "leader",
      reason: "   ",
    });

    expect(validation).toMatchObject({
      valid: false,
      code: "REASON_REQUIRED",
    });
    expect(() =>
      transitionApplication(application, "rejected", {
        actor: "leader",
      }),
    ).toThrow(ApplicationTransitionError);
  });

  it("참석 완료 같은 종결 상태에서는 다시 전이할 수 없다", () => {
    const attended: EventApplication = {
      ...application,
      status: "attended",
      approvedAt: "2026-07-18T10:00:00+09:00",
      attendedAt: "2026-07-25T12:00:00+09:00",
    };

    const validation = validateApplicationTransition(attended, "cancelled", {
      actor: "admin",
    });

    expect(validation).toMatchObject({
      valid: false,
      code: "INVALID_TRANSITION",
    });
  });

  it("유효하지 않은 변경 시각을 거부한다", () => {
    const validation = validateApplicationTransition(application, "approved", {
      actor: "leader",
      now: "오늘 오전",
    });

    expect(validation).toMatchObject({
      valid: false,
      code: "INVALID_TIMESTAMP",
    });
  });
});
