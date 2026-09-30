import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FirebasePhoneService } from "./firebase-phone.service";
import { parseApiEnv } from "../config/env";

const firebase = vi.hoisted(() => ({
  verifyIdToken: vi.fn(), applicationDefault: vi.fn(), getApps: vi.fn(), initializeApp: vi.fn(),
}));
vi.mock("firebase-admin/app", () => ({
  applicationDefault: firebase.applicationDefault, getApps: firebase.getApps, initializeApp: firebase.initializeApp,
}));
vi.mock("firebase-admin/auth", () => ({ getAuth: () => ({ verifyIdToken: firebase.verifyIdToken }) }));

const env = parseApiEnv({
  NODE_ENV: "test", DATABASE_URL: "postgresql://localhost/test",
  FIREBASE_PROJECT_ID: "clubsenior-app", PUSH_PROVIDER: "disabled",
});
const now = new Date("2026-09-30T01:00:00.000Z");
const validClaims = {
  uid: "firebase-user-1", phone_number: "+821012345678", auth_time: Math.floor(now.getTime() / 1000),
  firebase: { sign_in_provider: "phone", identities: { phone: ["+821012345678"] } },
};

describe("FirebasePhoneService", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers(); vi.setSystemTime(now);
    firebase.getApps.mockReturnValue([]);
    firebase.applicationDefault.mockReturnValue({ runtimeCredential: true });
    firebase.initializeApp.mockReturnValue({ name: "senior-club-phone-auth-clubsenior-app" });
    firebase.verifyIdToken.mockResolvedValue(validClaims);
  });
  afterEach(() => vi.useRealTimers());

  it("verifies revocation with Admin ADC independently of FCM and reuses its app", async () => {
    const service = new FirebasePhoneService(env);
    await expect(service.verifyPhoneIdToken("valid-id-token")).resolves.toEqual({ uid: validClaims.uid, phoneNumber: validClaims.phone_number });
    await service.verifyPhoneIdToken("second-id-token");
    expect(firebase.verifyIdToken).toHaveBeenCalledWith("valid-id-token", true);
    expect(firebase.initializeApp).toHaveBeenCalledOnce();
    expect(firebase.initializeApp).toHaveBeenCalledWith(
      { projectId: "clubsenior-app", credential: { runtimeCredential: true } }, "senior-club-phone-auth-clubsenior-app",
    );
  });

  it.each([
    { label: "missing phone", claims: { ...validClaims, phone_number: undefined } },
    { label: "local number", claims: { ...validClaims, phone_number: "01012345678" } },
    { label: "formatting", claims: { ...validClaims, phone_number: "+82 10 1234 5678" } },
    { label: "zero country code", claims: { ...validClaims, phone_number: "+0123456789" } },
    { label: "overlong E164", claims: { ...validClaims, phone_number: "+1234567890123456" } },
    { label: "Google sign-in with linked phone", claims: { ...validClaims, firebase: { ...validClaims.firebase, sign_in_provider: "google.com" } } },
    { label: "missing provider", claims: { ...validClaims, firebase: undefined } },
    { label: "mismatching phone identity", claims: { ...validClaims, firebase: { sign_in_provider: "phone", identities: { phone: ["+821099999999"] } } } },
    { label: "missing phone identity", claims: { ...validClaims, firebase: { sign_in_provider: "phone", identities: {} } } },
    { label: "missing uid", claims: { ...validClaims, uid: "" } },
    { label: "stale sign-in with fresh iat", claims: { ...validClaims, auth_time: validClaims.auth_time - 301, iat: validClaims.auth_time } },
    { label: "future sign-in", claims: { ...validClaims, auth_time: validClaims.auth_time + 31 } },
    { label: "missing auth time", claims: { ...validClaims, auth_time: undefined } },
    { label: "non-numeric auth time", claims: { ...validClaims, auth_time: "fresh" } },
  ])("rejects $label", async ({ claims }) => {
    firebase.verifyIdToken.mockResolvedValueOnce(claims);
    await expect(new FirebasePhoneService(env).verifyPhoneIdToken("token")).rejects.toMatchObject({ status: 401 });
  });

  it.each(["auth/id-token-revoked", "auth/user-disabled", "auth/id-token-expired", "auth/invalid-id-token", "auth/user-not-found"])("rejects %s without accepting claims", async (code) => {
    firebase.verifyIdToken.mockRejectedValueOnce({ code, message: "private credential details" });
    await expect(new FirebasePhoneService(env).verifyPhoneIdToken("token")).rejects.toMatchObject({ status: 401, response: { error: { code: "FIREBASE_TOKEN_INVALID" } } });
  });

  it("fails closed with a service error when ADC or revocation lookup is unavailable", async () => {
    firebase.verifyIdToken.mockRejectedValueOnce({ code: "auth/insufficient-permission" });
    await expect(new FirebasePhoneService(env).verifyPhoneIdToken("token")).rejects.toMatchObject({ status: 503, response: { error: { code: "FIREBASE_UNAVAILABLE" } } });
  });

  it("requires explicit project configuration", async () => {
    await expect(new FirebasePhoneService({ ...env, FIREBASE_PROJECT_ID: undefined }).verifyPhoneIdToken("token")).rejects.toMatchObject({ status: 503 });
    expect(firebase.verifyIdToken).not.toHaveBeenCalled();
  });

  it.each(["", "  ", "x".repeat(8193)])("rejects empty or oversized input before reaching Firebase", async (token) => {
    await expect(new FirebasePhoneService(env).verifyPhoneIdToken(token)).rejects.toMatchObject({ status: 400 });
    expect(firebase.verifyIdToken).not.toHaveBeenCalled();
  });
});
