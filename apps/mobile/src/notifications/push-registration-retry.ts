export const PUSH_REGISTRATION_RETRY_DELAYS_MS = [2_000, 10_000, 30_000] as const;

/**
 * Returns the delay after a failed registration attempt. A null result means the
 * current retry cycle is exhausted; a later foreground transition may start a
 * fresh bounded cycle.
 */
export function pushRegistrationRetryDelay(failedAttempts: number): number | null {
  if (!Number.isInteger(failedAttempts) || failedAttempts < 1) {
    throw new TypeError('failedAttempts는 1 이상의 정수여야 합니다.');
  }

  return PUSH_REGISTRATION_RETRY_DELAYS_MS[failedAttempts - 1] ?? null;
}
