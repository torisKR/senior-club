import { describe, expect, it } from "vitest";

import {
  getDemoApplicationStorageKey,
  parseStoredDemoApplication,
} from "@/lib/demo-applications";

describe("demo event application storage", () => {
  it("isolates an event application by user id", () => {
    expect(getDemoApplicationStorageKey("demo-user-a", "event-1")).not.toBe(
      getDemoApplicationStorageKey("demo-user-b", "event-1"),
    );
  });

  it("accepts only the matching user and event", () => {
    const serialized = JSON.stringify({
      userId: "demo-user-a",
      eventId: "event-1",
      status: "applied",
      appliedAt: "2026-07-18T09:00:00+09:00",
    });

    expect(
      parseStoredDemoApplication(serialized, {
        userId: "demo-user-a",
        eventId: "event-1",
      }),
    ).toBeTruthy();
    expect(
      parseStoredDemoApplication(serialized, {
        userId: "demo-user-b",
        eventId: "event-1",
      }),
    ).toBeNull();
  });
});
