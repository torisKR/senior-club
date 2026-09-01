import type { Route } from "next";

import { sanitizeReturnTo } from "@/lib/auth/return-to";

export function buildOnboardingRoute(returnTo: string): Route {
  const destination = sanitizeReturnTo(returnTo);
  return `/onboarding?returnTo=${encodeURIComponent(destination)}` as Route;
}

export function hasCompletedOnboarding(value: unknown) {
  return (
    typeof value === "string" &&
    value.trim() === value &&
    value.length > 0 &&
    Number.isFinite(Date.parse(value))
  );
}

/** Keeps the original same-origin intent, but never bypasses profile onboarding. */
export function postLoginRoute(
  returnTo: string,
  onboardingCompletedAt: unknown,
): Route {
  const destination = sanitizeReturnTo(returnTo);
  const destinationUrl = new URL(destination, "https://senior-club.invalid");
  if (destinationUrl.pathname === "/onboarding") {
    return hasCompletedOnboarding(onboardingCompletedAt)
      ? sanitizeReturnTo(destinationUrl.searchParams.get("returnTo"))
      : destination;
  }

  return hasCompletedOnboarding(onboardingCompletedAt)
    ? destination
    : buildOnboardingRoute(destination);
}
