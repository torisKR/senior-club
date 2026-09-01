import { describe, expect, it } from "vitest";

import {
  resolveSameOriginReturnTo,
  sanitizeReturnTo,
} from "@/lib/auth/return-to";

describe("server auth returnTo sanitizer", () => {
  it("preserves a same-origin path, query, and fragment", () => {
    expect(sanitizeReturnTo("/events/event-1?intent=apply#application")).toBe(
      "/events/event-1?intent=apply#application",
    );
  });

  it.each([
    "https://evil.example/events",
    "//evil.example/events",
    "/%2F%2Fevil.example/events",
    "/\\evil.example/events",
    "javascript:alert(1)",
  ])("reuses the fail-closed policy for %s", (value) => {
    expect(sanitizeReturnTo(value)).toBe("/");
  });

  it("rejects an unsafe fallback too", () => {
    expect(sanitizeReturnTo(undefined, "//evil.example")).toBe("/");
  });

  it("resolves a safe path without losing its query or fragment", () => {
    expect(
      resolveSameOriginReturnTo(
        "https://seniorclub.example/api/auth/continue",
        "/events/event-1?intent=apply#application",
      ).toString(),
    ).toBe(
      "https://seniorclub.example/events/event-1?intent=apply#application",
    );
  });

  it.each([
    "https://evil.example/events",
    "//evil.example/events",
    "/%2F%2Fevil.example/events",
    "/%255c%255cevil.example/events",
  ])("resolves unsafe or encoded returnTo value %s to the local root", (value) => {
    expect(
      resolveSameOriginReturnTo(
        "https://seniorclub.example/api/auth/continue",
        value,
      ).toString(),
    ).toBe("https://seniorclub.example/");
  });
});
