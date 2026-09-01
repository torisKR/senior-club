import { describe, expect, it } from "vitest";

import { isSafeNotificationId } from "@/lib/notification-id";

describe("isSafeNotificationId", () => {
  it.each([
    "notification-1",
    "event-cancel:application-1",
    "review-request:application_2",
  ])("accepts the bounded opaque server id %s", (id) => {
    expect(isSafeNotificationId(id)).toBe(true);
  });

  it.each([
    "",
    ":prefixed",
    "../admin",
    "notification/1",
    "notification?read=true",
    `n${"x".repeat(128)}`,
  ])("rejects the unsafe id %s", (id) => {
    expect(isSafeNotificationId(id)).toBe(false);
  });
});
