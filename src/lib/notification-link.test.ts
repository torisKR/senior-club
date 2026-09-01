import { describe, expect, it } from "vitest";

import { resolveNotificationHref } from "@/lib/notification-link";

describe("web notification link allowlist", () => {
  it.each([
    ["/", "/"],
    ["/events/event-123", "/events/event-123"],
    ["/clubs/photo-walk", "/clubs/photo-walk"],
    ["/clubs/photo-walk/posts", "/clubs/photo-walk/posts"],
    ["/chat?roomId=room-123", "/chat?roomId=room-123"],
    ["/reviews/new?eventId=event-123", "/reviews/new?eventId=event-123"],
    ["/home", "/"],
  ])("resolves the declared internal route %s", (value, expected) => {
    expect(resolveNotificationHref(value)).toBe(expected);
  });

  it("normalizes the API's legacy chat-room path to the existing chat page", () => {
    expect(resolveNotificationHref("/chat/seed-room-approved")).toBe(
      "/chat?roomId=seed-room-approved",
    );
  });

  it.each([
    null,
    "",
    " /events/event-1",
    "https://evil.example/events/event-1",
    "//evil.example/events/event-1",
    "javascript:alert(1)",
    "/events/../me",
    "/events/%2e%2e",
    "/events/%252e%252e",
    "/events/event%2Fadmin",
    "/events/event-1#application",
    "/api/me/notifications",
    "/admin",
    "/unknown",
  ])("rejects an undeclared or unsafe destination %s", (value) => {
    expect(resolveNotificationHref(value)).toBeNull();
  });

  it.each([
    "/reviews/new",
    "/reviews/new?eventId=event-1&next=https%3A%2F%2Fevil.example",
    "/reviews/new?eventId=event-1&eventId=event-2",
    "/chat?roomId=room-1&returnTo=%2Fadmin",
    "/events/event-1?next=%2Fadmin",
  ])("rejects missing, duplicate, or unknown parameters in %s", (value) => {
    expect(resolveNotificationHref(value)).toBeNull();
  });
});
