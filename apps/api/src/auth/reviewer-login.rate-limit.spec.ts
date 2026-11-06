import { describe, expect, it, vi } from "vitest";
import { AuthService } from "./auth.service";
import { TokenService } from "./token.service";
import { FirebaseReviewerService } from "./firebase-reviewer.service";
import { ApiException } from "../common/http/api.exception";
import { parseApiEnv } from "../config/env";
import type { PrismaService } from "../prisma/prisma.service";
import type { ReviewerLoginInput } from "./auth.contracts";

const input: ReviewerLoginInput = { idToken: "fixture-token-proof", clientType: "ANDROID", termsAccepted: true, privacyAccepted: true };
describe("reviewer exchange throttling", () => {
  it("does not let rejected proofs exhaust valid review access and scopes verified requests", async () => {
    const env = parseApiEnv({ DATABASE_URL: "postgresql://localhost/test" });
    const tokens = new TokenService(env);
    const verify = vi.fn().mockRejectedValue(new ApiException(401, "REVIEWER_CREDENTIALS_INVALID", "invalid"));
    const transaction = vi.fn().mockRejectedValue(new Error("verified-request-reached-database"));
    const auth = new AuthService({ $transaction: transaction } as unknown as PrismaService, tokens, undefined!, undefined!, undefined!, env, { verify } as unknown as FirebaseReviewerService);
    for (let i = 0; i < 65; i++) await expect(auth.loginWithReviewer(input, { ipAddress: "127.0.0.1" })).rejects.toMatchObject({ status: 401 });
    expect(transaction).not.toHaveBeenCalled();
    verify.mockResolvedValue({ uid: "reviewer-fixture" });
    for (let i = 0; i < 60; i++) await expect(auth.loginWithReviewer(input, { ipAddress: "127.0.0.1" })).rejects.toThrow("verified-request-reached-database");
    await expect(auth.loginWithReviewer(input, { ipAddress: "127.0.0.1" })).rejects.toMatchObject({ status: 429 });
    await expect(auth.loginWithReviewer(input, { ipAddress: "127.0.0.2" })).rejects.toThrow("verified-request-reached-database");
  });
});
