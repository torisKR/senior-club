const SAFE_NOTIFICATION_ID = /^[A-Za-z0-9][A-Za-z0-9._:~-]{0,127}$/;

/**
 * Notification IDs are opaque server identifiers. Some generated IDs use a
 * bounded namespace prefix such as `event-cancel:` or `review-request:`.
 */
export function isSafeNotificationId(value: string): boolean {
  return SAFE_NOTIFICATION_ID.test(value);
}
