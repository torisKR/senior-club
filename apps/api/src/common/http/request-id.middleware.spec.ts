import { describe, expect, it } from "vitest";

import { resolveRequestId } from "./request-id.middleware";

describe("resolveRequestId", () => {
  it("preserves a bounded valid request ID", () => {
    expect(resolveRequestId("req_01JZ.test-123")).toBe("req_01JZ.test-123");
  });

  it("replaces malformed or oversized IDs", () => {
    expect(resolveRequestId("contains spaces")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f-]{27}$/,
    );
    expect(resolveRequestId("x".repeat(129))).not.toBe("x".repeat(129));
  });
});

