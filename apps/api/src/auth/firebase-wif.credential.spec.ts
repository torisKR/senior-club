import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AwsClient, AwsClientOptions } from "google-auth-library";

import { parseApiEnv } from "../config/env";
import { createFirebasePhoneCredential } from "./firebase-wif.credential";

const mocks = vi.hoisted(() => ({
  fromContainerMetadata: vi.fn(), provider: vi.fn(), applicationDefault: vi.fn(),
  clients: [] as AwsClient[], options: [] as AwsClientOptions[],
}));
vi.mock("@aws-sdk/credential-providers", () => ({ fromContainerMetadata: mocks.fromContainerMetadata }));
vi.mock("firebase-admin/app", () => ({ applicationDefault: mocks.applicationDefault }));
vi.mock("google-auth-library", async (importOriginal) => {
  const actual = await importOriginal<typeof import("google-auth-library")>();
  class CapturedAwsClient extends actual.AwsClient {
    constructor(options: AwsClientOptions) {
      super(options);
      mocks.clients.push(this);
      mocks.options.push(options);
    }
  }
  return { ...actual, AwsClient: CapturedAwsClient };
});

const input = {
  NODE_ENV: "test", DATABASE_URL: "postgresql://localhost/test",
  FIREBASE_PROJECT_ID: "clubsenior-app", AWS_REGION: "ap-northeast-2",
  FIREBASE_WIF_AUDIENCE: "//iam.googleapis.com/projects/982568561637/locations/global/workloadIdentityPools/senior-club-prod/providers/aws-ecs",
  FIREBASE_WIF_SERVICE_ACCOUNT_EMAIL: "senior-phone-verifier@clubsenior-app.iam.gserviceaccount.com",
};
const env = parseApiEnv(input);
const now = new Date("2026-10-01T00:00:00.000Z");
const taskCredentials = {
  accessKeyId: "test-task-key", secretAccessKey: "test-task-secret", sessionToken: "test-task-session",
  expiration: new Date(now.getTime() + 3_600_000),
};
const iamUrl = `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${input.FIREBASE_WIF_SERVICE_ACCOUNT_EMAIL}:generateAccessToken`;

function setupCredential() {
  const credential = createFirebasePhoneCredential(env);
  // Both the Google STS and IAM clients use Gaxios. Mock that transport while
  // exercising the real AwsClient signing, token exchange, cache, and refresh.
  const transport = vi.spyOn(Object.getPrototypeOf(mocks.clients[0]!.transporter), "request").mockImplementation(async (request: unknown) => {
    const url = String((request as { url: string | URL }).url);
    if (url === "https://sts.googleapis.com/v1/token") {
      return { data: { access_token: "test-federated-token", expires_in: 3_600, token_type: "Bearer" } };
    }
    if (url === iamUrl) {
      return { data: { accessToken: "test-impersonated-token", expireTime: new Date(Date.now() + 3_600_000).toISOString() } };
    }
    throw new Error("Unexpected external endpoint");
  });
  return { credential, transport };
}

describe("Firebase ECS WIF credential", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.stubEnv("AWS_CONTAINER_CREDENTIALS_RELATIVE_URI", "/v2/credentials/12345678-1234-1234-1234-123456789012");
    mocks.clients.length = 0;
    mocks.options.length = 0;
    mocks.fromContainerMetadata.mockReturnValue(mocks.provider);
    mocks.provider.mockResolvedValue(taskCredentials);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("keeps ADC when WIF is absent without loading AWS credentials", () => {
    const adc = { getAccessToken: vi.fn() };
    mocks.applicationDefault.mockReturnValue(adc);
    expect(createFirebasePhoneCredential(parseApiEnv({ NODE_ENV: "test", DATABASE_URL: input.DATABASE_URL, FIREBASE_PROJECT_ID: input.FIREBASE_PROJECT_ID }))).toBe(adc);
    expect(mocks.fromContainerMetadata).not.toHaveBeenCalled();
    expect(mocks.clients).toHaveLength(0);
  });

  it("exchanges an ECS-signed assertion and requests the Firebase Auth scope on the impersonated token", async () => {
    vi.stubEnv("FIREBASE_WIF_TOKEN_URL", "https://attacker.example/token");
    vi.stubEnv("FIREBASE_WIF_SERVICE_ACCOUNT_IMPERSONATION_URL", "https://attacker.example/iam");
    vi.stubEnv("AWS_ACCESS_KEY_ID", "unused-static-key");
    vi.stubEnv("AWS_SECRET_ACCESS_KEY", "unused-static-secret");
    const { credential, transport } = setupCredential();
    await expect(credential.getAccessToken()).resolves.toEqual({ access_token: "test-impersonated-token", expires_in: 3_600 });
    expect(mocks.applicationDefault).not.toHaveBeenCalled();
    expect(mocks.fromContainerMetadata).toHaveBeenCalledWith({ timeout: 1_000, maxRetries: 1 });
    const exchange = transport.mock.calls[0]![0] as { url: string; data: URLSearchParams };
    expect(exchange.url).toBe("https://sts.googleapis.com/v1/token");
    expect(exchange.data.get("audience")).toBe(input.FIREBASE_WIF_AUDIENCE);
    expect(exchange.data.get("subject_token_type")).toBe("urn:ietf:params:aws:token-type:aws4_request");
    expect(exchange.data.get("scope")).toBe("https://www.googleapis.com/auth/cloud-platform");
    const assertion = JSON.parse(decodeURIComponent(exchange.data.get("subject_token")!));
    expect(assertion.url).toBe("https://sts.ap-northeast-2.amazonaws.com?Action=GetCallerIdentity&Version=2011-06-15");
    expect(assertion.headers).toContainEqual({ key: "x-amz-security-token", value: taskCredentials.sessionToken });
    expect(assertion.headers).toContainEqual({ key: "x-goog-cloud-target-resource", value: input.FIREBASE_WIF_AUDIENCE });
    expect(assertion.headers.find((header: { key: string }) => header.key === "authorization").value).toContain("Credential=test-task-key/");
    expect(transport.mock.calls[1]![0]).toMatchObject({
      url: iamUrl, method: "POST", headers: { authorization: "Bearer test-federated-token" },
      data: { scope: ["https://www.googleapis.com/auth/identitytoolkit"], lifetime: "3600s" },
    });
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it("caches tokens, coalesces concurrent refreshes, and rotates expired AWS task credentials", async () => {
    const { credential, transport } = setupCredential();
    await Promise.all([credential.getAccessToken(), credential.getAccessToken()]);
    expect(mocks.provider).toHaveBeenCalledOnce();
    expect(transport).toHaveBeenCalledTimes(2);
    vi.setSystemTime(now.getTime() + 1_000);
    await expect(credential.getAccessToken()).resolves.toMatchObject({ expires_in: 3_599 });
    expect(transport).toHaveBeenCalledTimes(2);
    mocks.provider.mockResolvedValue({ ...taskCredentials, accessKeyId: "rotated-task-key", expiration: new Date(now.getTime() + 7_200_000) });
    vi.setSystemTime(now.getTime() + 3_600_000);
    await Promise.all([credential.getAccessToken(), credential.getAccessToken()]);
    expect(mocks.provider).toHaveBeenCalledTimes(2);
    expect(transport).toHaveBeenCalledTimes(4);
    const exchange = transport.mock.calls[2]![0] as { data: URLSearchParams };
    expect(decodeURIComponent(exchange.data.get("subject_token")!)).toContain("Credential=rotated-task-key/");
  });

  it("refreshes Google tokens using still-valid cached ECS credentials", async () => {
    mocks.provider.mockResolvedValue({ ...taskCredentials, expiration: new Date(now.getTime() + 7_200_000) });
    const { credential, transport } = setupCredential();
    await credential.getAccessToken();
    vi.setSystemTime(now.getTime() + 3_301_000);
    await credential.getAccessToken();
    expect(mocks.provider).toHaveBeenCalledOnce();
    expect(transport).toHaveBeenCalledTimes(4);
  });

  it("fails closed when ECS rotation fails and retries without using expired credentials", async () => {
    const { credential, transport } = setupCredential();
    await credential.getAccessToken();
    vi.setSystemTime(now.getTime() + 3_600_000);
    mocks.provider.mockRejectedValueOnce(new Error("private task credential details"));
    await expect(credential.getAccessToken()).rejects.toThrow("Firebase WIF credential unavailable");
    expect(transport).toHaveBeenCalledTimes(2);
    mocks.provider.mockResolvedValue({ ...taskCredentials, expiration: new Date(now.getTime() + 7_200_000) });
    await expect(credential.getAccessToken()).resolves.toMatchObject({ access_token: "test-impersonated-token" });
    expect(mocks.provider).toHaveBeenCalledTimes(3);
  });

  it.each(["provider", "exchange", "impersonation"])("sanitizes %s failures and allows a later retry", async (stage) => {
    const { credential, transport } = setupCredential();
    const privateError = new Error("private signed assertion, bearer token, and phone number");
    if (stage === "provider") mocks.provider.mockRejectedValueOnce(privateError);
    if (stage === "exchange") transport.mockRejectedValueOnce(privateError);
    if (stage === "impersonation") {
      transport.mockResolvedValueOnce({ data: { access_token: "test-federated-token", expires_in: 3_600 } }).mockRejectedValueOnce(privateError);
    }
    await expect(credential.getAccessToken()).rejects.toThrow(/^Firebase WIF credential unavailable$/);
    await expect(credential.getAccessToken()).resolves.toMatchObject({ access_token: "test-impersonated-token" });
    expect(mocks.applicationDefault).not.toHaveBeenCalled();
  });

  it.each([
    { sessionToken: undefined }, { expiration: undefined }, { expiration: now },
    { expiration: new Date("invalid") }, { accessKeyId: "" }, { secretAccessKey: "" },
  ])("rejects incomplete or expired ECS credentials before Google requests: %j", async (override) => {
    mocks.provider.mockResolvedValue({ ...taskCredentials, ...override });
    const { credential, transport } = setupCredential();
    await expect(credential.getAccessToken()).rejects.toThrow("Firebase WIF credential unavailable");
    expect(transport).not.toHaveBeenCalled();
  });

  it.each([undefined, "", "https://attacker.example/credentials", "/v2/credentials/id?redirect=elsewhere"])("rejects missing or arbitrary ECS credential paths: %s", async (relativeUri) => {
    vi.stubEnv("AWS_CONTAINER_CREDENTIALS_RELATIVE_URI", relativeUri);
    vi.stubEnv("AWS_CONTAINER_CREDENTIALS_FULL_URI", "http://localhost/credentials");
    const { credential, transport } = setupCredential();
    await expect(credential.getAccessToken()).rejects.toThrow("Firebase WIF credential unavailable");
    expect(mocks.provider).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
  });

  it.each([
    { accessToken: "" }, { accessToken: undefined }, { expireTime: undefined },
    { expireTime: now.toISOString() }, { expireTime: "invalid" },
  ])("rejects missing tokens and invalid expiry from Google: %j", async (override) => {
    const { credential, transport } = setupCredential();
    transport.mockResolvedValueOnce({ data: { access_token: "test-federated-token", expires_in: 3_600 } }).mockResolvedValueOnce({ data: { accessToken: "test-impersonated-token", expireTime: new Date(now.getTime() + 3_600_000).toISOString(), ...override } });
    await expect(credential.getAccessToken()).rejects.toThrow("Firebase WIF credential unavailable");
  });

  it.each([
    { FIREBASE_WIF_SERVICE_ACCOUNT_EMAIL: undefined }, { FIREBASE_WIF_AUDIENCE: undefined },
    { FIREBASE_WIF_AUDIENCE: "//iam.googleapis.com.attacker.example/projects/123/locations/global/workloadIdentityPools/club/providers/evil" },
    { FIREBASE_WIF_SERVICE_ACCOUNT_EMAIL: "phone-verifier@clubsenior-app.iam.gserviceaccount.com/../../evil" },
    { FIREBASE_PROJECT_ID: undefined }, { AWS_REGION: undefined }, { AWS_REGION: "ap-northeast-2.attacker.example/" },
  ])("fails closed if callers bypass validated config: %j", (override) => {
    expect(() => createFirebasePhoneCredential({ ...env, ...override })).toThrow("Invalid Firebase WIF configuration");
    expect(mocks.clients).toHaveLength(0);
    expect(mocks.applicationDefault).not.toHaveBeenCalled();
  });
});
