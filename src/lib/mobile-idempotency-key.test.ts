import { describe, expect, it, vi } from "vitest";

import { createIdempotencyKeyFromUuid } from "../../apps/mobile/src/api/idempotency-key-core";

describe("mobile native idempotency key", () => {
  it("uses the supplied native UUID v4 generator without relying on global crypto", () => {
    const previousCrypto = globalThis.crypto;
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: undefined });
    const randomUUID = vi.fn(() => "87a71a93-6f4d-4c0a-9da8-a5679338c8e5");

    try {
      expect(createIdempotencyKeyFromUuid(randomUUID)).toBe(
        "87a71a93-6f4d-4c0a-9da8-a5679338c8e5",
      );
      expect(randomUUID).toHaveBeenCalledOnce();
    } finally {
      Object.defineProperty(globalThis, "crypto", {
        configurable: true,
        value: previousCrypto,
      });
    }
  });

  it("rejects malformed native output", () => {
    expect(() => createIdempotencyKeyFromUuid(() => "not-a-uuid")).toThrow(
      "올바른 UUID v4",
    );
  });
});
