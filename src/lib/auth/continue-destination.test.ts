import { describe, expect, it } from "vitest";

import { continuationDestination } from "./continue-destination";

describe("session continuation destination", () => {
  it("preserves a safe content path, query and fragment", () => {
    expect(continuationDestination("/events/event-1?intent=apply#application"))
      .toBe("/events/event-1?intent=apply#application");
  });

  it.each([
    null, undefined, "https://evil.example/me", "//evil.example/me", "/%252f%252fevil.example",
    "/login", "/login/?returnTo=/me", "/auth/continue?returnTo=/me", "/api/auth", "/api/auth/session",
    "/%6cogin", "/auth/%63ontinue", "/%256cogin", "/events/../login",
  ])("does not restart authentication for %s", (value) => {
    expect(continuationDestination(value)).toBe("/");
  });

  it("keeps onboarding and its original intent", () => {
    expect(continuationDestination("/onboarding?returnTo=%2Fme")).toBe("/onboarding?returnTo=%2Fme");
  });
});
