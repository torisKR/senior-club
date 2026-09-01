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
