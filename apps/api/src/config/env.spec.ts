import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";

import { EnvValidationError, parseApiEnv, parseCorsOrigins } from "./env";

const VALID_DATABASE_URL =
  "postgresql://user:password@localhost:5432/senior_club";

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
  NODE_ENV: "production", DATABASE_URL: VALID_DATABASE_URL,
  CORS_ORIGINS: "https://seniorclub.kr", KAKAO_APP_ID: "1539455",
  AUTH_ACCESS_TOKEN_SECRET: "production-test-access-secret-32-characters",
  AUTH_OTP_PEPPER: "production-test-pepper-secret-32-characters",
  AUTH_OTP_ENCRYPTION_KEY_BASE64: Buffer.alloc(32, 7).toString("base64"),
  EMAIL_PROVIDER: "disabled", SMS_PROVIDER: "disabled", PUSH_PROVIDER: "disabled",
};

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
