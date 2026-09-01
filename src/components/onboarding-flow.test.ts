import { describe, expect, it } from "vitest";

import {
  buildOnboardingLoginHref,
  parseBirthYearInput,
} from "@/components/onboarding-flow";

describe("onboarding profile helpers", () => {
  it("accepts only an exact four-digit adult birth year", () => {
    expect(parseBirthYearInput("1962", 2026)).toBe(1962);
    expect(parseBirthYearInput(" 1962 ", 2026)).toBe(1962);
    expect(parseBirthYearInput("62", 2026)).toBeNull();
    expect(parseBirthYearInput("1899", 2026)).toBeNull();
    expect(parseBirthYearInput("2009", 2026)).toBeNull();
  });

  it("returns to the onboarding page after re-authentication without an open redirect", () => {
    const href = buildOnboardingLoginHref("/events/event-1?tab=apply");
    const loginReturnTo = new URL(href, "https://seniorclub.example").searchParams.get(
      "returnTo",
    );

    expect(loginReturnTo).toBe(
      "/onboarding?returnTo=%2Fevents%2Fevent-1%3Ftab%3Dapply",
    );
    expect(
      new URL(
        buildOnboardingLoginHref("https://evil.example/steal"),
        "https://seniorclub.example",
      ).searchParams.get("returnTo"),
    ).toBe("/onboarding?returnTo=%2F");
  });
});
