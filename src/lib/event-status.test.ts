import { describe, expect, it } from "vitest";

import { EVENTS } from "@/lib/data";
import {
  getEffectiveEventStatus,
  isEventRegistrationOpen,
  isUpcomingEvent,
} from "@/lib/event-status";

const BEFORE_EVENT = new Date("2026-07-25T07:00:00+09:00");
const DURING_EVENT = new Date("2026-07-25T09:00:00+09:00");
const AFTER_EVENT = new Date("2026-07-25T13:00:00+09:00");

describe("effective event status", () => {
  const fixture = EVENTS.find(
    (event) => event.id === "event-bukhansan-dullegil",
  );

  if (!fixture) throw new Error("event fixture is missing");

  it("keeps a future recruiting event open", () => {
    expect(getEffectiveEventStatus(fixture, BEFORE_EVENT)).toBe("recruiting");
    expect(isEventRegistrationOpen(fixture, BEFORE_EVENT)).toBe(true);
    expect(isUpcomingEvent(fixture, BEFORE_EVENT)).toBe(true);
  });

  it("closes registration when an event has started", () => {
    expect(getEffectiveEventStatus(fixture, DURING_EVENT)).toBe("closed");
    expect(isEventRegistrationOpen(fixture, DURING_EVENT)).toBe(false);
    expect(isUpcomingEvent(fixture, DURING_EVENT)).toBe(false);
  });

  it("treats an ended recruiting fixture as completed", () => {
    expect(getEffectiveEventStatus(fixture, AFTER_EVENT)).toBe("completed");
    expect(isEventRegistrationOpen(fixture, AFTER_EVENT)).toBe(false);
    expect(isUpcomingEvent(fixture, AFTER_EVENT)).toBe(false);
  });

  it("closes registration at the explicit API deadline", () => {
    const event = {
      ...fixture,
      startAt: "2026-08-10T10:00:00+09:00",
      endAt: "2026-08-10T12:00:00+09:00",
      registrationDeadline: "2026-08-09T18:00:00+09:00",
      status: "recruiting" as const,
    };
    const afterDeadline = new Date("2026-08-09T18:00:01+09:00");

    expect(getEffectiveEventStatus(event, afterDeadline)).toBe("closed");
    expect(isEventRegistrationOpen(event, afterDeadline)).toBe(false);
  });
});
