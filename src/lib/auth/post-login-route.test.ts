import { describe, expect, it } from "vitest";

import {
  buildOnboardingRoute,
  hasCompletedOnboarding,
  postLoginRoute,
} from "@/lib/auth/post-login-route";

describe("post-login onboarding routing", () => {
  it("sends an incomplete profile through onboarding and preserves the event intent", () => {
    expect(postLoginRoute("/events/event-1#application", null)).toBe(
      "/onboarding?returnTo=%2Fevents%2Fevent-1%23application",
    );
  });

  it("returns a completed profile directly to the original event", () => {
    expect(
      postLoginRoute(
        "/events/event-1#application",
        "2026-07-30T01:00:00.000Z",
      ),
    ).toBe("/events/event-1#application");
  });

  it("does not nest an existing onboarding return route after re-authentication", () => {
    const existingOnboarding =
      "/onboarding?returnTo=%2Fevents%2Fevent-1%23application";
    expect(postLoginRoute(existingOnboarding, null)).toBe(existingOnboarding);
    expect(
      postLoginRoute(existingOnboarding, "2026-07-30T01:00:00.000Z"),
    ).toBe("/events/event-1#application");
  });

  it("fails closed for malformed completion values and external destinations", () => {
    expect(hasCompletedOnboarding("not-a-date")).toBe(false);
    expect(buildOnboardingRoute("https://evil.example/steal")).toBe(
      "/onboarding?returnTo=%2F",
    );
    expect(postLoginRoute("//evil.example/steal", undefined)).toBe(
      "/onboarding?returnTo=%2F",
    );
  });
});
