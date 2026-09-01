import { describe, expect, it } from "vitest";

import {
  PUSH_REGISTRATION_RETRY_DELAYS_MS,
  pushRegistrationRetryDelay,
} from "../../apps/mobile/src/notifications/push-registration-retry";

describe("mobile push registration retry", () => {
  it("uses bounded, increasing delays", () => {
    expect(PUSH_REGISTRATION_RETRY_DELAYS_MS).toEqual([2_000, 10_000, 30_000]);
    expect(pushRegistrationRetryDelay(1)).toBe(2_000);
    expect(pushRegistrationRetryDelay(2)).toBe(10_000);
    expect(pushRegistrationRetryDelay(3)).toBe(30_000);
    expect(pushRegistrationRetryDelay(4)).toBeNull();
  });

  it.each([0, -1, 1.5, Number.NaN])("rejects an invalid failure count: %s", (value) => {
    expect(() => pushRegistrationRetryDelay(value)).toThrow(TypeError);
  });
});
