import { afterEach, describe, expect, it, vi } from "vitest";

import { navigateAfterSessionRestore } from "./browser-navigation";

afterEach(() => vi.unstubAllGlobals());

describe("navigation after restoring session cookies", () => {
  it.each([
    ["/me?tab=profile#contact", "/me?tab=profile#contact"],
    ["/onboarding?returnTo=%2Fme", "/onboarding?returnTo=%2Fme"],
    ["https://evil.example/me", "/"],
    ["/auth/continue", "/"],
  ])("loads fresh SSR for %s", (destination, expected) => {
    const replace = vi.fn();
    vi.stubGlobal("window", { location: { replace } });
    navigateAfterSessionRestore(destination);
    expect(replace).toHaveBeenCalledWith(expected);
  });
});
