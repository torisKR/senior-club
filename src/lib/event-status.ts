import type { Event, EventStatus } from "@/lib/types";

function parseTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function participantCount(event: Event): number {
  return event.participantCount ?? event.currentMembers ?? 0;
}

/**
 * Fixture/API status can lag behind the clock. Public pages must never keep
 * advertising an event as open after it has started or ended.
 */
export function getEffectiveEventStatus(
  event: Event,
  now: Date = new Date(),
): EventStatus {
  if (event.status === "cancelled") return "cancelled";
  if (event.status === "completed") return "completed";

  const nowTimestamp = now.getTime();
  const endTimestamp = parseTimestamp(event.endAt);
  if (endTimestamp !== null && endTimestamp <= nowTimestamp) {
    return "completed";
  }

  if (event.status === "closed") return "closed";

  const registrationDeadline = parseTimestamp(event.registrationDeadline);
  if (registrationDeadline !== null && registrationDeadline <= nowTimestamp) {
    return "closed";
  }

  const startTimestamp = parseTimestamp(event.startAt);
  if (startTimestamp !== null && startTimestamp <= nowTimestamp) {
    return "closed";
  }

  return "recruiting";
}

export function isEventRegistrationOpen(
  event: Event,
  now: Date = new Date(),
): boolean {
  return (
    getEffectiveEventStatus(event, now) === "recruiting" &&
    participantCount(event) < event.capacity
  );
}

export function isUpcomingEvent(
  event: Event,
  now: Date = new Date(),
): boolean {
  const effectiveStatus = getEffectiveEventStatus(event, now);
  if (effectiveStatus === "completed" || effectiveStatus === "cancelled") {
    return false;
  }

  const startTimestamp = parseTimestamp(event.startAt);
  return startTimestamp === null || startTimestamp > now.getTime();
}
