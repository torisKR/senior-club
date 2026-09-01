import { describe, expect, it } from 'vitest';

import {
  AUTH_RESTORE_RETRY_DELAYS_MS,
  authRestoreRetryDelay,
  isRetryableAuthRestoreError,
} from '@/auth/auth-restore-retry';

describe('auth restore retry policy', () => {
  it.each([
    { status: 0, code: 'NETWORK_ERROR' },
    { status: 0, code: 'REQUEST_TIMEOUT' },
    { status: 408, code: 'HTTP_408' },
    { status: 429, code: 'RATE_LIMITED' },
    { status: 500, code: 'INTERNAL_SERVER_ERROR' },
    { status: 503, code: 'SERVICE_UNAVAILABLE' },
  ])('preserves credentials for transient failures', (error) => {
    expect(isRetryableAuthRestoreError(error)).toBe(true);
  });

  it.each([
    { status: 0, code: 'INVALID_AUTH_RESPONSE' },
    { status: 400, code: 'INVALID_REFRESH_TOKEN' },
    { status: 401, code: 'INVALID_REFRESH_TOKEN' },
    { status: 403, code: 'SESSION_REVOKED' },
  ])('does not retry terminal or malformed authentication failures', (error) => {
    expect(isRetryableAuthRestoreError(error)).toBe(false);
  });

  it('uses the bounded retry schedule', () => {
    expect(AUTH_RESTORE_RETRY_DELAYS_MS.map((_, index) => authRestoreRetryDelay(index + 1))).toEqual(
      [...AUTH_RESTORE_RETRY_DELAYS_MS],
    );
    expect(authRestoreRetryDelay(AUTH_RESTORE_RETRY_DELAYS_MS.length + 1)).toBeNull();
  });
});
