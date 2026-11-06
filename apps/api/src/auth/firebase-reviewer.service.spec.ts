import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Logger } from "@nestjs/common";
import { parseApiEnv } from "../config/env";
import { FirebaseReviewerService } from "./firebase-reviewer.service";

const firebase = vi.hoisted(() => ({ verifyIdToken: vi.fn(), getApps: vi.fn(), initializeApp: vi.fn(), applicationDefault: vi.fn() }));
vi.mock("firebase-admin/app", () => ({ getApps: firebase.getApps, initializeApp: firebase.initializeApp, applicationDefault: firebase.applicationDefault }));
vi.mock("firebase-admin/auth", () => ({ getAuth: () => ({ verifyIdToken: firebase.verifyIdToken }) }));
const env = parseApiEnv({ NODE_ENV: "test", DATABASE_URL: "postgresql://localhost/test", FIREBASE_PROJECT_ID: "clubsenior-app", AUTH_REVIEWER_FIREBASE_UID: "reviewer-fixture-uid" });
const now = new Date("2026-10-02T02:00:00Z");
const claims = { uid: "reviewer-fixture-uid", email: "reviewer@example.com", auth_time: now.getTime() / 1000, firebase: { sign_in_provider: "password", identities: { email: ["reviewer@example.com"] } } };

describe("Firebase reviewer identity boundary", () => {
  beforeEach(() => {
    vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(now);
    firebase.getApps.mockReturnValue([]); firebase.applicationDefault.mockReturnValue({ adc: true });
    firebase.initializeApp.mockReturnValue({ name: "reviewer-app" }); firebase.verifyIdToken.mockResolvedValue(claims);
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it("requires server-configured UID and SDK signature/audience/revocation verification", async () => {
    const verifier = new FirebaseReviewerService(env);
    await expect(verifier.verify("valid-token".repeat(3))).resolves.toEqual({ uid: claims.uid });
    await verifier.verify("another-token".repeat(3));
    expect(firebase.verifyIdToken).toHaveBeenCalledWith("valid-token".repeat(3), true);
    expect(firebase.initializeApp).toHaveBeenCalledOnce();
    expect(firebase.initializeApp).toHaveBeenCalledWith({ projectId: "clubsenior-app", credential: { adc: true } }, "senior-club-reviewer-auth-clubsenior-app");
  });
  it("defaults to disabled before touching Firebase", async () => {
    await expect(new FirebaseReviewerService({ ...env, AUTH_REVIEWER_FIREBASE_UID: undefined }).verify("x".repeat(30))).rejects.toMatchObject({ status: 403 });
    expect(firebase.verifyIdToken).not.toHaveBeenCalled();
  });
  it.each([
    { ...claims, uid: "another-valid-firebase-user" },
    { ...claims, firebase: { ...claims.firebase, sign_in_provider: "phone" } },
    { ...claims, firebase: { ...claims.firebase, sign_in_provider: "google.com" } },
    { ...claims, firebase: { ...claims.firebase, sign_in_provider: "custom" } },
    { ...claims, firebase: undefined },
    { ...claims, email: undefined },
    { ...claims, firebase: { ...claims.firebase, identities: { email: ["another@example.com"] } } },
    { ...claims, auth_time: claims.auth_time - 301, iat: claims.auth_time },
    { ...claims, auth_time: claims.auth_time + 31 },
    { ...claims, auth_time: undefined },
  ])("rejects wrong UID/provider/identity or stale authentication", async (invalid) => {
    firebase.verifyIdToken.mockResolvedValue(invalid);
    await expect(new FirebaseReviewerService(env).verify("x".repeat(30))).rejects.toMatchObject({ status: 401 });
  });
  it.each(["auth/invalid-id-token", "auth/id-token-expired", "auth/id-token-revoked", "auth/user-disabled", "auth/user-not-found"])("rejects %s", async (code) => {
    firebase.verifyIdToken.mockRejectedValue({ code, message: "private-token-details" });
    await expect(new FirebaseReviewerService(env).verify("x".repeat(30))).rejects.toMatchObject({ status: 401 });
  });
  it("fails closed and never logs credential error text during provider outages", async () => {
    const warning = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => {});
    firebase.verifyIdToken.mockRejectedValue(new Error("secret WIF assertion"));
    await expect(new FirebaseReviewerService(env).verify("x".repeat(30))).rejects.toMatchObject({ status: 503 });
    expect(warning).toHaveBeenCalledWith("Reviewer verification failed: unknown");
  });
  it.each(["", "x", "x".repeat(8193)])("rejects invalid input before provider access", async (token) => {
    await expect(new FirebaseReviewerService(env).verify(token)).rejects.toMatchObject({ status: 400 });
    expect(firebase.verifyIdToken).not.toHaveBeenCalled();
  });
});
