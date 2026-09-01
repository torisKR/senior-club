export const DEMO_EVENT_APPLICATION_STORAGE_PREFIX =
  "club-senior:event-application:";

export type StoredDemoApplication = {
  eventId: string;
  userId: string;
  status: "applied";
  appliedAt: string;
};

export function getDemoApplicationStorageKey(
  userId: string,
  eventId: string,
) {
  return `${DEMO_EVENT_APPLICATION_STORAGE_PREFIX}${encodeURIComponent(userId)}:${encodeURIComponent(eventId)}`;
}

export function parseStoredDemoApplication(
  serialized: string | null | undefined,
  expected: { userId: string; eventId: string },
) {
  if (!serialized) return null;

  try {
    const value = JSON.parse(serialized) as Partial<StoredDemoApplication>;
    if (
      value.userId !== expected.userId ||
      value.eventId !== expected.eventId ||
      value.status !== "applied" ||
      typeof value.appliedAt !== "string" ||
      !Number.isFinite(Date.parse(value.appliedAt))
    ) {
      return null;
    }

    return value as StoredDemoApplication;
  } catch {
    return null;
  }
}
