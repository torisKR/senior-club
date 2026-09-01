export const AUTH_RESTORE_RETRY_DELAYS_MS = [2_000, 10_000, 30_000] as const;

const RETRYABLE_NETWORK_CODES = new Set(['NETWORK_ERROR', 'REQUEST_TIMEOUT']);

export function isRetryableAuthRestoreError(error: unknown) {
  if (error === null || typeof error !== 'object') return false;

  const candidate = error as { status?: unknown; code?: unknown };
  if (
    typeof candidate.status === 'number' &&
    (candidate.status === 408 ||
      candidate.status === 429 ||
      (candidate.status >= 500 && candidate.status <= 599))
  ) {
    return true;
  }

  return (
    candidate.status === 0 &&
    typeof candidate.code === 'string' &&
    RETRYABLE_NETWORK_CODES.has(candidate.code)
  );
}

export function authRestoreRetryDelay(failedAttempts: number): number | null {
  if (!Number.isInteger(failedAttempts) || failedAttempts < 1) {
    throw new TypeError('failedAttempts는 1 이상의 정수여야 합니다.');
  }

  return AUTH_RESTORE_RETRY_DELAYS_MS[failedAttempts - 1] ?? null;
}
