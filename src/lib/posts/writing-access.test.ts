import { describe, expect, it } from "vitest";

import { resolveWritingAccess } from "@/lib/posts/writing-access";

describe("community writing access gate", () => {
  it("treats absent or explicitly signed-out sessions as anonymous", () => {
    expect(resolveWritingAccess(null)).toEqual({ status: "anonymous" });
    expect(resolveWritingAccess({ authenticated: false })).toEqual({
      status: "anonymous",
    });
  });

  it("requires onboarding after authentication", () => {
    expect(
      resolveWritingAccess({
        authenticated: true,
        user: { id: "member-1", onboardingCompletedAt: null },
      }),
    ).toEqual({ status: "onboarding" });
  });

  it("allows an authenticated member with completed onboarding", () => {
    expect(
      resolveWritingAccess({
        authenticated: true,
        user: {
          id: "member-1",
          onboardingCompletedAt: "2026-07-30T00:00:00.000Z",
        },
      }),
    ).toEqual({ status: "ready", userId: "member-1" });
  });

  it("fails closed when an authenticated session has no usable member id", () => {
    expect(() =>
      resolveWritingAccess({
        authenticated: true,
        user: { onboardingCompletedAt: "2026-07-30T00:00:00.000Z" },
      }),
    ).toThrow("회원 정보를 확인하지 못했습니다.");
  });
});
