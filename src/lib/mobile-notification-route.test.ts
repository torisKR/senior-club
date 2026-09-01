import { describe, expect, it } from "vitest";

import {
  notificationRouteFromData,
  parseAppRoute,
} from "../../apps/mobile/src/notifications/notification-route";

describe("mobile notification route allowlist", () => {
  it("converts canonical web event and club routes to native routes", () => {
    expect(parseAppRoute("/events/event-bukhansan-dullegil")).toEqual({
      ok: true,
      route: "/event/event-bukhansan-dullegil",
    });
    expect(parseAppRoute("/clubs/photo-walk")).toEqual({
      ok: true,
      route: "/club/photo-walk",
    });
  });

  it("allows only declared parameters on exact app routes", () => {
    expect(parseAppRoute("/reviews/new?eventId=event-123")).toEqual({
      ok: true,
      route: "/reviews/new?eventId=event-123",
    });
    expect(parseAppRoute("/reviews/new?eventId=event-123&next=https://evil.test")).toEqual({
      ok: false,
      reason: "invalid-parameter",
    });
  });

  it.each([
    "https://evil.test/events/1",
    "//evil.test/events/1",
    "/events/../me",
    "/events/%2e%2e",
    "/events/%252e%252e",
    "/events/event-1#fragment",
    "/unknown",
  ])("rejects untrusted destination %s", (destination) => {
    expect(parseAppRoute(destination).ok).toBe(false);
  });

  it("extracts only allowlisted route fields from notification data", () => {
    expect(notificationRouteFromData({ route: "/events/event-1" })).toEqual({
      ok: true,
      route: "/event/event-1",
    });
    expect(notificationRouteFromData({ targetPath: "javascript:alert(1)" }).ok).toBe(false);
    expect(notificationRouteFromData(null).ok).toBe(false);
  });
});
