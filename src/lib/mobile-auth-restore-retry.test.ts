import { describe, expect, it } from "vitest";

import {
  AUTH_RESTORE_RETRY_DELAYS_MS,
  authRestoreRetryDelay,
  isRetryableAuthRestoreError,
} from "../../apps/mobile/src/auth/auth-restore-retry";

describe("mobile auth restore retry", () => {
  it("uses a bounded retry schedule", () => {
    expect(AUTH_RESTORE_RETRY_DELAYS_MS).toEqual([2_000, 10_000, 30_000]);
    expect(authRestoreRetryDelay(1)).toBe(2_000);
    expect(authRestoreRetryDelay(2)).toBe(10_000);
    expect(authRestoreRetryDelay(3)).toBe(30_000);
    expect(authRestoreRetryDelay(4)).toBeNull();
  });

  it("retries only network, timeout and server failures", () => {
    expect(isRetryableAuthRestoreError({ status: 0, code: "NETWORK_ERROR" })).toBe(true);
    expect(isRetryableAuthRestoreError({ status: 0, code: "REQUEST_TIMEOUT" })).toBe(true);
    expect(isRetryableAuthRestoreError({ status: 500, code: "SERVER_ERROR" })).toBe(true);
    expect(isRetryableAuthRestoreError({ status: 503 })).toBe(true);
  });

  it("never retries invalid credentials or non-network client failures", () => {
    expect(isRetryableAuthRestoreError({ status: 401, code: "INVALID_REFRESH_TOKEN" })).toBe(false);
    expect(isRetryableAuthRestoreError({ status: 403, code: "SESSION_REVOKED" })).toBe(false);
    expect(isRetryableAuthRestoreError({ status: 0, code: "INVALID_AUTH_RESPONSE" })).toBe(false);
    expect(isRetryableAuthRestoreError({ status: 0, code: "SESSION_STORAGE_FAILED" })).toBe(false);
    expect(isRetryableAuthRestoreError(null)).toBe(false);
  });

  it.each([0, -1, 1.5, Number.NaN])("rejects an invalid failure count: %s", (value) => {
    expect(() => authRestoreRetryDelay(value)).toThrow(TypeError);
  });
});
