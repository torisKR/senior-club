import { describe, expect, it } from "vitest";

import { normalizePhoneNumber, normalizedPhoneNumber } from "./phone-number";

describe("phone number normalization", () => {
  it("converts Korean mobile formatting to E.164", () => {
    expect(normalizePhoneNumber("010-1234-5678")).toBe("+821012345678");
    expect(normalizedPhoneNumber.parse("+82 10 1234 5678")).toBe("+821012345678");
  });

  it("accepts international E.164 numbers", () => {
    expect(normalizePhoneNumber("+14155552671")).toBe("+14155552671");
  });

  it("rejects invalid or non-mobile Korean numbers", () => {
    expect(() => normalizePhoneNumber("02-1234-5678")).toThrow();
    expect(() => normalizePhoneNumber("010-1234")).toThrow();
  });
});
