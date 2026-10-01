import { describe, expect, it } from "vitest";
import { reviewerLoginSchema } from "./auth.contracts";
import { parseApiEnv } from "../config/env";

const input = { idToken: "fixture-id-token".repeat(3), clientType: "ANDROID", termsAccepted: true, privacyAccepted: true };
describe("reviewer login request", () => {
  it("accepts only Android token proof with both consents", () => {
    expect(reviewerLoginSchema.parse(input)).toEqual(input);
  });
  it.each([
    { ...input, clientType: "WEB" }, { ...input, clientType: "IOS" },
    { ...input, termsAccepted: false }, { ...input, privacyAccepted: false },
    { ...input, role: "ADMIN" }, { ...input, uid: "caller-chosen-user" },
    { ...input, password: "not-forwarded-to-api" }, { ...input, idToken: "" },
  ])("rejects client-selected identity/role, platform or missing consent", (value) => {
    expect(reviewerLoginSchema.safeParse(value).success).toBe(false);
  });
  it("requires a Firebase project whenever review access is enabled", () => {
    expect(() => parseApiEnv({ DATABASE_URL: "postgresql://localhost/test", AUTH_REVIEWER_FIREBASE_UID: "reviewer-fixture-uid" })).toThrow(/FIREBASE_PROJECT_ID/);
  });
});
