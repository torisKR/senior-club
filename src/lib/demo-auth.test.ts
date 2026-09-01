import { describe, expect, it } from "vitest";

import {
  buildDemoLoginHref,
  clearDemoSession,
  createDemoSession,
  DEMO_SESSION_STORAGE_KEY,
  getSafeReturnTo,
  getStableDemoUserId,
  parseDemoSession,
  readDemoSession,
  saveDemoSession,
} from "@/lib/demo-auth";

function createMemoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe("demo session", () => {
  it("normalizes identity and keeps the same user id for the same email", () => {
    const first = createDemoSession({
      email: " Member@Example.COM ",
      name: "  김   정희  ",
      now: "2026-07-18T09:00:00+09:00",
    });
    const second = createDemoSession({
      email: "member@example.com",
      name: "정희",
      now: "2026-07-19T09:00:00+09:00",
    });

    expect(first).toMatchObject({
      email: "member@example.com",
      name: "김 정희",
      userId: second.userId,
    });
    expect(first.userId).toBe(getStableDemoUserId("MEMBER@example.com"));
  });

  it("round-trips a valid session and clears it", () => {
    const storage = createMemoryStorage();
    const session = createDemoSession({
      email: "member@example.com",
      name: "정희",
      now: "2026-07-18T09:00:00+09:00",
    });

    saveDemoSession(storage, session);
    expect(readDemoSession(storage)).toEqual(session);
    expect(storage.getItem(DEMO_SESSION_STORAGE_KEY)).toBeTruthy();

    clearDemoSession(storage);
    expect(readDemoSession(storage)).toBeNull();
  });

  it("rejects malformed and tampered session values", () => {
    expect(parseDemoSession("not-json")).toBeNull();
    expect(
      parseDemoSession(
        JSON.stringify({
          version: 1,
          mode: "demo",
          userId: "demo-tampered",
          email: "member@example.com",
          name: "정희",
          startedAt: "2026-07-18T09:00:00+09:00",
        }),
      ),
    ).toBeNull();
  });
});

describe("safe login return path", () => {
  it("keeps internal paths with query strings and fragments", () => {
    expect(getSafeReturnTo("/events/walk?intent=apply#application")).toBe(
      "/events/walk?intent=apply#application",
    );
    expect(buildDemoLoginHref("/events/walk#application")).toBe(
      "/login?returnTo=%2Fevents%2Fwalk%23application",
    );
  });

  it.each([
    "https://evil.example/events",
    "//evil.example/events",
    "/\\evil.example/events",
    "/%5C%5Cevil.example/events",
    "/%2F%2Fevil.example/events",
    "javascript:alert(1)",
    " /events/walk",
  ])("rejects unsafe returnTo value %s", (value) => {
    expect(getSafeReturnTo(value)).toBe("/");
  });

  it("uses only a safe fallback", () => {
    expect(getSafeReturnTo(null, "/events")).toBe("/events");
    expect(getSafeReturnTo(null, "//evil.example")).toBe("/");
  });
});
