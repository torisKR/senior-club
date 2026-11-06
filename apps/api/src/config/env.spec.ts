import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";

import { EnvValidationError, parseApiEnv, parseCorsOrigins } from "./env";

const VALID_DATABASE_URL =
  "postgresql://user:password@localhost:5432/senior_club";
const VALID_PRODUCTION_DATABASE_URL =
  "postgresql://user:password@db.example:5432/senior_club?sslmode=verify-full&sslrootcert=/app/rds-ca.pem";

describe("parseApiEnv", () => {
  it("parses and normalizes a valid environment", () => {
    const env = parseApiEnv({
      NODE_ENV: "test",
      PORT: "4100",
      DATABASE_URL: VALID_DATABASE_URL,
      CORS_ORIGINS: "https://senior.example, https://admin.example",
    });

    expect(env.PORT).toBe(4_100);
    expect(env.CORS_ORIGINS).toEqual([
      "https://senior.example",
      "https://admin.example",
    ]);
    expect(env.OUTBOX_POLL_INTERVAL_MS).toBe(5_000);
    expect(env.ACCOUNT_DELETION_POLL_INTERVAL_MS).toBe(300_000);
  });

  it("does not expose the rejected database URL in its error", () => {
    const secretValue = "mysql://secret-user:secret-password@db.example/app";

    expect(() =>
      parseApiEnv({ NODE_ENV: "test", DATABASE_URL: secretValue }),
    ).toThrow(EnvValidationError);

    try {
      parseApiEnv({ NODE_ENV: "test", DATABASE_URL: secretValue });
    } catch (error) {
      expect(String(error)).not.toContain(secretValue);
      expect(String(error)).not.toContain("secret-password");
    }
  });

  it("requires explicit CORS origins in production", () => {
    expect(() =>
      parseApiEnv({ NODE_ENV: "production", DATABASE_URL: VALID_DATABASE_URL }),
    ).toThrow(/CORS_ORIGINS/);
  });
});

describe("parseCorsOrigins", () => {
  it("uses the local web origin outside production", () => {
    expect(parseCorsOrigins(undefined, "development")).toEqual([
      "http://localhost:3000",
    ]);
  });

  it("rejects paths because CORS entries must be origins", () => {
    expect(() =>
      parseCorsOrigins("https://senior.example/path", "production"),
    ).toThrow(/invalid origin/);
  });
});

const productionInput = {
  NODE_ENV: "production", DATABASE_URL: VALID_PRODUCTION_DATABASE_URL,
  CORS_ORIGINS: "https://seniorclub.kr", KAKAO_APP_ID: "1539455",
  AUTH_ACCESS_TOKEN_SECRET: "production-test-access-secret-32-characters",
  AUTH_OTP_PEPPER: "production-test-pepper-secret-32-characters",
  AUTH_OTP_ENCRYPTION_KEY_BASE64: Buffer.alloc(32, 7).toString("base64"),
  EMAIL_PROVIDER: "disabled", SMS_PROVIDER: "disabled", PUSH_PROVIDER: "disabled",
};

describe("Firebase WIF environment", () => {
  const wifInput = {
    ...productionInput, FIREBASE_PROJECT_ID: "clubsenior-app", AWS_REGION: "ap-northeast-2",
    FIREBASE_WIF_AUDIENCE: "//iam.googleapis.com/projects/982568561637/locations/global/workloadIdentityPools/senior-club-prod/providers/aws-ecs",
    FIREBASE_WIF_SERVICE_ACCOUNT_EMAIL: "senior-phone-verifier@clubsenior-app.iam.gserviceaccount.com",
  };

  it("accepts a complete WIF config independently of push credentials", () => {
    expect(parseApiEnv(wifInput)).toMatchObject({
      FIREBASE_WIF_AUDIENCE: wifInput.FIREBASE_WIF_AUDIENCE,
      FIREBASE_WIF_SERVICE_ACCOUNT_EMAIL: wifInput.FIREBASE_WIF_SERVICE_ACCOUNT_EMAIL,
      AWS_REGION: "ap-northeast-2", PUSH_PROVIDER: "disabled",
    });
  });

  it.each(["FIREBASE_PROJECT_ID", "FIREBASE_WIF_AUDIENCE", "FIREBASE_WIF_SERVICE_ACCOUNT_EMAIL", "AWS_REGION"])("rejects partial WIF config missing %s", (key) => {
    expect(() => parseApiEnv({ ...wifInput, [key]: undefined })).toThrow(EnvValidationError);
  });

  it.each([
    { FIREBASE_WIF_AUDIENCE: "https://attacker.example/token" },
    { FIREBASE_WIF_AUDIENCE: wifInput.FIREBASE_WIF_AUDIENCE.replace("iam.googleapis.com/", "iam.googleapis.com.attacker.example/") },
    { FIREBASE_WIF_AUDIENCE: wifInput.FIREBASE_WIF_AUDIENCE.replace("982568561637", "project-id") },
    { FIREBASE_WIF_AUDIENCE: `${wifInput.FIREBASE_WIF_AUDIENCE}?redirect=evil` },
    { FIREBASE_WIF_SERVICE_ACCOUNT_EMAIL: "https://iamcredentials.googleapis.com.attacker.example/iam" },
    { FIREBASE_WIF_SERVICE_ACCOUNT_EMAIL: `${wifInput.FIREBASE_WIF_SERVICE_ACCOUNT_EMAIL}/../../evil` },
    { FIREBASE_WIF_SERVICE_ACCOUNT_EMAIL: `${wifInput.FIREBASE_WIF_SERVICE_ACCOUNT_EMAIL}?redirect=evil` },
    { FIREBASE_WIF_SERVICE_ACCOUNT_EMAIL: `${wifInput.FIREBASE_WIF_SERVICE_ACCOUNT_EMAIL}.attacker.example` },
    { AWS_REGION: "ap-northeast-2.attacker.example" }, { AWS_REGION: "ap-northeast-2/../../evil" },
    { FIREBASE_WIF_AUDIENCE: "" }, { FIREBASE_WIF_SERVICE_ACCOUNT_EMAIL: "" },
  ])("rejects untrusted WIF config without including the supplied value: %j", (override) => {
    expect(() => parseApiEnv({ ...wifInput, ...override })).toThrow(EnvValidationError);
    try {
      parseApiEnv({ ...wifInput, ...override });
    } catch (error) {
      expect(String(error)).not.toContain("attacker.example");
    }
  });

  it("retains ADC configuration without WIF or AWS settings", () => {
    expect(parseApiEnv({ ...productionInput, FIREBASE_PROJECT_ID: "clubsenior-app" })).toMatchObject({
      FIREBASE_WIF_AUDIENCE: undefined, FIREBASE_WIF_SERVICE_ACCOUNT_EMAIL: undefined, AWS_REGION: undefined,
    });
  });

  it("accepts the ECS region with baseline settings when WIF is not enabled", () => {
    expect(parseApiEnv({ ...productionInput, AWS_REGION: "ap-northeast-2" })).toMatchObject({
      AWS_REGION: "ap-northeast-2", FIREBASE_WIF_AUDIENCE: undefined, FIREBASE_WIF_SERVICE_ACCOUNT_EMAIL: undefined,
    });
  });
});

describe("production database transport", () => {
  it("accepts the deployed verify-full URL and bundled RDS root without changing it", () => {
    expect(parseApiEnv(productionInput).DATABASE_URL).toBe(VALID_PRODUCTION_DATABASE_URL);
  });

  it.each([
    "sslmode=verify-full",
    "sslmode=verify-full&ssl=true",
    "sslmode=verify-full&ssl=1",
    "sslmode=verify-full&uselibpqcompat=true",
    "sslmode=verify-full&uselibpqcompat=false&sslnegotiation=postgres",
    "sslmode=verify-full&sslnegotiation=direct",
    "ssl%6dode=verify-full&sslrootcert=%2Fapp%2Frds-ca.pem",
    "sslmode=verify-full&application_name=senior%20club",
  ])("accepts explicit certificate and hostname verification: %s", (query) => {
    const databaseUrl = `${VALID_DATABASE_URL}?${query}`;
    expect(parseApiEnv({ ...productionInput, DATABASE_URL: databaseUrl }).DATABASE_URL).toBe(databaseUrl);
  });

  it.each([
    "", "sslmode=", "sslmode=disable", "sslmode=allow", "sslmode=prefer",
    "sslmode=require", "sslmode=verify-ca", "sslmode=no-verify",
    "sslmode=unknown", "sslmode=VERIFY-FULL", "sslmode=verify-full%20",
    "ssl=0", "ssl=false", "ssl=no-verify", "ssl=true",
    "sslrootcert=/app/rds-ca.pem", "sslnegotiation=direct",
    "sslmode=require&uselibpqcompat=true",
    "sslmode=require&uselibpqcompat=true&sslrootcert=/app/rds-ca.pem",
    "sslmode=verify-ca&uselibpqcompat=true&sslrootcert=/app/rds-ca.pem",
    "sslmode=verify-full&ssl=0", "sslmode=verify-full&ssl=false",
    "sslmode=verify-full&ssl=no-verify", "sslmode=verify-full&ssl=",
    "sslmode=verify-full&sslrootcert=", "sslmode=verify-full&sslcert=",
    "sslmode=verify-full&sslkey=", "sslmode=verify-full&uselibpqcompat=invalid",
    "sslmode=verify-full&sslnegotiation=invalid",
    "SSLMode=verify-full", "sslmode=verify-full&SSLMode=disable",
  ])("rejects missing, ambiguous or unsafe TLS settings: %s", (query) => {
    expect(() => parseApiEnv({
      ...productionInput, DATABASE_URL: `${VALID_DATABASE_URL}?${query}`,
    })).toThrow(/DATABASE_URL/);
  });

  it.each([
    "sslmode=verify-full&sslmode=disable",
    "sslmode=disable&sslmode=verify-full",
    "sslmode=verify-full&sslmode=verify-full",
    "sslmode=verify-full&%73slmode=no-verify",
    "sslmode=verify-full&ssl=true&ssl=0",
    "sslmode=verify-full&ssl=0&ssl=true",
    "sslmode=verify-full&sslrootcert=/app/rds-ca.pem&sslrootcert=",
    "sslmode=verify-full&sslrootcert=&sslrootcert=/app/rds-ca.pem",
    "sslmode=verify-full&sslcert=client.pem&sslcert=other.pem",
    "sslmode=verify-full&sslkey=client.key&sslkey=other.key",
    "sslmode=verify-full&uselibpqcompat=false&uselibpqcompat=true",
    "sslmode=verify-full&sslnegotiation=postgres&sslnegotiation=direct",
  ])("rejects duplicate TLS query parameters regardless of order: %s", (query) => {
    expect(() => parseApiEnv({
      ...productionInput, DATABASE_URL: `${VALID_DATABASE_URL}?${query}`,
    })).toThrow(/DATABASE_URL.*repeat TLS query parameters/);
  });

  it.each([
    "ssl%6dode=verify-full&application_name=senior club",
    "ssl%6dode=verify-full&application_name=%invalid",
    "ssl%6dode=verify-full&application_name=%2x",
    "sslmode=verify-full&application_name=%",
  ])("rejects URL encodings that pg may interpret differently: %s", (query) => {
    expect(() => parseApiEnv({
      ...productionInput, DATABASE_URL: `${VALID_DATABASE_URL}?${query}`,
    })).toThrow(/DATABASE_URL/);
  });

  it("rejects the process-wide certificate verification bypass in production", () => {
    expect(() => parseApiEnv({
      ...productionInput, NODE_TLS_REJECT_UNAUTHORIZED: "0",
    })).toThrow(/NODE_TLS_REJECT_UNAUTHORIZED/);
    expect(parseApiEnv({
      ...productionInput, NODE_TLS_REJECT_UNAUTHORIZED: "1",
    }).DATABASE_URL).toBe(VALID_PRODUCTION_DATABASE_URL);
  });

  it.each(["development", "test"])("preserves local PostgreSQL in %s", (nodeEnvironment) => {
    for (const databaseUrl of [VALID_DATABASE_URL, `${VALID_DATABASE_URL}?sslmode=disable`]) {
      expect(parseApiEnv({
        NODE_ENV: nodeEnvironment, DATABASE_URL: databaseUrl,
      }).DATABASE_URL).toBe(databaseUrl);
    }
  });

  it.each([
    "sslmode=no-verify",
    "sslmode=verify-full&sslmode=disable",
    "sslmode=verify-full&sslrootcert=",
    "ssl%6dode=verify-full&application_name=secret value",
  ])("does not expose database credentials or URL in TLS errors: %s", (query) => {
    const databaseUrl = `postgresql://private-user:private-password@private-db.example/app?${query}`;
    let validationError: unknown;
    try {
      parseApiEnv({ ...productionInput, DATABASE_URL: databaseUrl });
    } catch (error) {
      validationError = error;
    }
    expect(validationError).toBeInstanceOf(EnvValidationError);
    const reportedError = `${String(validationError)} ${JSON.stringify((validationError as EnvValidationError).issues)}`;
    for (const secret of [databaseUrl, "private-user", "private-password", "private-db.example", "secret value"]) {
      expect(reportedError).not.toContain(secret);
    }
  });
});

describe("production optional providers", () => {
  it("starts Kakao-only production with explicitly disabled outbound channels and no provider credentials", () => {
    expect(parseApiEnv(productionInput)).toMatchObject({ NODE_ENV: "production", KAKAO_APP_ID: 1539455, EMAIL_PROVIDER: "disabled", SMS_PROVIDER: "disabled", PUSH_PROVIDER: "disabled" });
  });
  it("configures phone verification independently of FCM credentials", () => {
    expect(parseApiEnv({ ...productionInput, FIREBASE_PROJECT_ID: "clubsenior-app" }).FIREBASE_PROJECT_ID).toBe("clubsenior-app");
  });
  it.each([
    { EMAIL_PROVIDER: "console" }, { SMS_PROVIDER: "console" },
    { EMAIL_PROVIDER: undefined }, { SMS_PROVIDER: undefined },
    { KAKAO_APP_ID: undefined }, { AUTH_DEV_OTP_EXPOSE: "true" },
    { AUTH_ACCESS_TOKEN_SECRET: undefined }, { AUTH_OTP_PEPPER: undefined },
    { AUTH_OTP_ENCRYPTION_KEY_BASE64: undefined },
    { FIREBASE_AUTH_EMULATOR_HOST: "localhost:9099" },
  ])("rejects unsafe production settings %j", (override) => {
    expect(() => parseApiEnv({ ...productionInput, ...override })).toThrow(EnvValidationError);
  });
  it.each([
    { EMAIL_PROVIDER: "resend" },
    { EMAIL_PROVIDER: "resend", RESEND_API_KEY: "invalid-secret", EMAIL_FROM: "no-reply@example.com" },
    { EMAIL_PROVIDER: "resend", RESEND_API_KEY: "re_abcdefghijklmnop", EMAIL_FROM: "invalid sender" },
    { SMS_PROVIDER: "twilio" },
    { SMS_PROVIDER: "twilio", TWILIO_ACCOUNT_SID: "AC" + "a".repeat(32), TWILIO_AUTH_TOKEN: "invalid", TWILIO_FROM_NUMBER: "+14155552671" },
    { SMS_PROVIDER: "twilio", TWILIO_ACCOUNT_SID: "AC" + "a".repeat(32), TWILIO_AUTH_TOKEN: "b".repeat(32), TWILIO_FROM_NUMBER: "01012345678" },
    { PUSH_PROVIDER: "firebase" },
    { PUSH_PROVIDER: "firebase", FCM_SERVICE_ACCOUNT_JSON_BASE64: Buffer.from(JSON.stringify({ project_id: "clubsenior-app", client_email: "test@example.com", private_key: "fake-key" })).toString("base64") },
  ])("requires valid credentials for enabled providers %j", (override) => {
    expect(() => parseApiEnv({ ...productionInput, ...override })).toThrow(EnvValidationError);
    expect(() => parseApiEnv({ ...productionInput, NODE_ENV: "development", ...override })).toThrow(EnvValidationError);
  });
  it("accepts configured Resend and Twilio credentials", () => {
    expect(parseApiEnv({ ...productionInput, EMAIL_PROVIDER: "resend", RESEND_API_KEY: "re_abcdefghijklmnop", EMAIL_FROM: "시니어클럽 <no-reply@example.com>", SMS_PROVIDER: "twilio", TWILIO_ACCOUNT_SID: "AC" + "a".repeat(32), TWILIO_AUTH_TOKEN: "b".repeat(32), TWILIO_FROM_NUMBER: "+14155552671" }).EMAIL_PROVIDER).toBe("resend");
  });
  it("validates a configured push credential as RSA without persisting any key", () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const encoded = Buffer.from(JSON.stringify({ project_id: "test-project", client_email: "test@test-project.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }) })).toString("base64");
    expect(parseApiEnv({ ...productionInput, PUSH_PROVIDER: "firebase", FCM_SERVICE_ACCOUNT_JSON_BASE64: encoded }).PUSH_PROVIDER).toBe("firebase");
  });
});
