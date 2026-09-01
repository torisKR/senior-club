import { z } from "zod";

const DEFAULT_DEVELOPMENT_ORIGIN = "http://localhost:3000";
const POSTGRES_PROTOCOLS = new Set(["postgres:", "postgresql:"]);
const DEVELOPMENT_ACCESS_SECRET =
  "development-only-access-token-secret-change-me";
const DEVELOPMENT_OTP_PEPPER =
  "development-only-otp-pepper-change-me";
const DEVELOPMENT_OTP_ENCRYPTION_KEY =
  "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";

const databaseUrlSchema = z
  .string()
  .trim()
  .min(1, "DATABASE_URL is required")
  .superRefine((value, context) => {
    try {
      const url = new URL(value);
      if (!POSTGRES_PROTOCOLS.has(url.protocol)) {
        context.addIssue({
          code: "custom",
          message: "DATABASE_URL must use the postgres or postgresql protocol",
        });
      }
    } catch {
      context.addIssue({
        code: "custom",
        message: "DATABASE_URL must be a valid PostgreSQL URL",
      });
    }
  });

const rawApiEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4_000),
  DATABASE_URL: databaseUrlSchema,
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(5),
  DATABASE_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(100).max(30_000).default(1_500),
  DATABASE_IDLE_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(300_000).default(10_000),
  READINESS_TIMEOUT_MS: z.coerce.number().int().min(100).max(30_000).default(2_000),
  CORS_ORIGINS: z.string().optional(),
  AUTH_ACCESS_TOKEN_SECRET: z.string().min(32).max(512).default(DEVELOPMENT_ACCESS_SECRET),
  AUTH_OTP_PEPPER: z.string().min(32).max(512).default(DEVELOPMENT_OTP_PEPPER),
  AUTH_OTP_ENCRYPTION_KEY_BASE64: z.string().default(DEVELOPMENT_OTP_ENCRYPTION_KEY),
  AUTH_ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(300).max(3_600).default(900),
  AUTH_REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  AUTH_OTP_TTL_SECONDS: z.coerce.number().int().min(180).max(1_800).default(600),
  AUTH_DEV_OTP_EXPOSE: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  KAKAO_APP_ID: z.coerce.number().int().positive().optional(),
  CONSENT_DOCUMENT_VERSION: z.string().min(1).max(40).default("2026-07-01"),
  EMAIL_PROVIDER: z.enum(["console", "resend"]).default("console"),
  EMAIL_FROM: z.string().min(3).max(320).default("시니어클럽 <no-reply@localhost>"),
  RESEND_API_KEY: z.string().min(1).optional(),
  SMS_PROVIDER: z.enum(["console", "twilio"]).default("console"),
  TWILIO_ACCOUNT_SID: z.string().regex(/^AC[a-f0-9]{32}$/i).optional(),
  TWILIO_AUTH_TOKEN: z.string().min(1).optional(),
  TWILIO_MESSAGING_SERVICE_SID: z.string().regex(/^MG[a-f0-9]{32}$/i).optional(),
  TWILIO_FROM_NUMBER: z.string().min(8).max(24).optional(),
  PUSH_PROVIDER: z.enum(["disabled", "firebase"]).default("disabled"),
  FCM_SERVICE_ACCOUNT_JSON_BASE64: z.string().min(1).optional(),
  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().min(500).max(60_000).default(5_000),
  ACCOUNT_DELETION_POLL_INTERVAL_MS: z.coerce.number().int().min(5_000).max(3_600_000).default(300_000),
  OUTBOX_WORKER_ENABLED: z.enum(["true", "false"]).default("true").transform((value) => value === "true"),
});

export type NodeEnvironment = "development" | "test" | "production";

export interface ApiEnv {
  readonly NODE_ENV: NodeEnvironment;
  readonly PORT: number;
  readonly DATABASE_URL: string;
  readonly DATABASE_POOL_MAX: number;
  readonly DATABASE_CONNECT_TIMEOUT_MS: number;
  readonly DATABASE_IDLE_TIMEOUT_MS: number;
  readonly READINESS_TIMEOUT_MS: number;
  readonly CORS_ORIGINS: readonly string[];
  readonly AUTH_ACCESS_TOKEN_SECRET: string;
  readonly AUTH_OTP_PEPPER: string;
  readonly AUTH_OTP_ENCRYPTION_KEY_BASE64: string;
  readonly AUTH_ACCESS_TOKEN_TTL_SECONDS: number;
  readonly AUTH_REFRESH_TOKEN_TTL_DAYS: number;
  readonly AUTH_OTP_TTL_SECONDS: number;
  readonly AUTH_DEV_OTP_EXPOSE: boolean;
  readonly KAKAO_APP_ID: number | undefined;
  readonly CONSENT_DOCUMENT_VERSION: string;
  readonly EMAIL_PROVIDER: "console" | "resend";
  readonly EMAIL_FROM: string;
  readonly RESEND_API_KEY: string | undefined;
  readonly SMS_PROVIDER: "console" | "twilio";
  readonly TWILIO_ACCOUNT_SID: string | undefined;
  readonly TWILIO_AUTH_TOKEN: string | undefined;
  readonly TWILIO_MESSAGING_SERVICE_SID: string | undefined;
  readonly TWILIO_FROM_NUMBER: string | undefined;
  readonly PUSH_PROVIDER: "disabled" | "firebase";
  readonly FCM_SERVICE_ACCOUNT_JSON_BASE64: string | undefined;
  readonly OUTBOX_POLL_INTERVAL_MS: number;
  readonly ACCOUNT_DELETION_POLL_INTERVAL_MS: number;
  readonly OUTBOX_WORKER_ENABLED: boolean;
}

export class EnvValidationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Invalid API environment:\n${issues.map((issue) => `- ${issue}`).join("\n")}`);
    this.name = "EnvValidationError";
    this.issues = issues;
  }
}

function validateOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    const isHttp = url.protocol === "http:" || url.protocol === "https:";
    const isOriginOnly =
      url.pathname === "/" && url.search === "" && url.hash === "";
    return isHttp && isOriginOnly ? url.origin : null;
  } catch {
    return null;
  }
}

export function parseCorsOrigins(
  value: string | undefined,
  nodeEnvironment: NodeEnvironment,
): readonly string[] {
  const candidates = (value ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (candidates.length === 0 && nodeEnvironment !== "production") {
    return [DEFAULT_DEVELOPMENT_ORIGIN];
  }

  if (candidates.length === 0) {
    throw new EnvValidationError([
      "CORS_ORIGINS must contain at least one explicit origin in production",
    ]);
  }

  const normalized = candidates.map((candidate) => {
    const origin = validateOrigin(candidate);
    if (!origin) {
      throw new EnvValidationError([
        `CORS_ORIGINS contains an invalid origin: ${candidate}`,
      ]);
    }
    return origin;
  });

  return Object.freeze([...new Set(normalized)]);
}

export function parseApiEnv(input: NodeJS.ProcessEnv = process.env): ApiEnv {
  const parsed = rawApiEnvSchema.safeParse(input);

  if (!parsed.success) {
    throw new EnvValidationError(
      parsed.error.issues.map((issue) => {
        const path = issue.path.join(".") || "environment";
        return `${path}: ${issue.message}`;
      }),
    );
  }

  const corsOrigins = parseCorsOrigins(
    parsed.data.CORS_ORIGINS,
    parsed.data.NODE_ENV,
  );

  if (parsed.data.DATABASE_CONNECT_TIMEOUT_MS > parsed.data.READINESS_TIMEOUT_MS) {
    throw new EnvValidationError([
      "DATABASE_CONNECT_TIMEOUT_MS must not exceed READINESS_TIMEOUT_MS",
    ]);
  }

  let otpEncryptionKey: Buffer;
  try {
    otpEncryptionKey = Buffer.from(
      parsed.data.AUTH_OTP_ENCRYPTION_KEY_BASE64,
      "base64",
    );
  } catch {
    otpEncryptionKey = Buffer.alloc(0);
  }
  if (otpEncryptionKey.length !== 32) {
    throw new EnvValidationError([
      "AUTH_OTP_ENCRYPTION_KEY_BASE64 must decode to exactly 32 bytes",
    ]);
  }

  if (parsed.data.PUSH_PROVIDER === "firebase") {
    try {
      const encoded = parsed.data.FCM_SERVICE_ACCOUNT_JSON_BASE64;
      if (!encoded || encoded.length > 200_000) throw new Error("missing");
      const serviceAccount = JSON.parse(
        Buffer.from(encoded, "base64").toString("utf8"),
      ) as Record<string, unknown>;
      if (
        typeof serviceAccount.project_id !== "string" ||
        typeof serviceAccount.client_email !== "string" ||
        typeof serviceAccount.private_key !== "string"
      ) {
        throw new Error("invalid");
      }
    } catch {
      throw new EnvValidationError([
        "FCM_SERVICE_ACCOUNT_JSON_BASE64 must encode a Firebase service account JSON",
      ]);
    }
  }

  if (parsed.data.SMS_PROVIDER === "twilio") {
    const hasSender = Boolean(
      parsed.data.TWILIO_MESSAGING_SERVICE_SID ||
        parsed.data.TWILIO_FROM_NUMBER,
    );
    if (
      !parsed.data.TWILIO_ACCOUNT_SID ||
      !parsed.data.TWILIO_AUTH_TOKEN ||
      !hasSender
    ) {
      throw new EnvValidationError([
        "SMS_PROVIDER=twilio requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER",
      ]);
    }
    if (
      parsed.data.TWILIO_MESSAGING_SERVICE_SID &&
      parsed.data.TWILIO_FROM_NUMBER
    ) {
      throw new EnvValidationError([
        "Set only one of TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER",
      ]);
    }
  }

  if (parsed.data.NODE_ENV === "production") {
    const productionIssues: string[] = [];
    if (parsed.data.AUTH_DEV_OTP_EXPOSE) {
      productionIssues.push("AUTH_DEV_OTP_EXPOSE must be false in production");
    }
    if (parsed.data.AUTH_ACCESS_TOKEN_SECRET === DEVELOPMENT_ACCESS_SECRET) {
      productionIssues.push("AUTH_ACCESS_TOKEN_SECRET must be replaced in production");
    }
    if (parsed.data.AUTH_OTP_PEPPER === DEVELOPMENT_OTP_PEPPER) {
      productionIssues.push("AUTH_OTP_PEPPER must be replaced in production");
    }
    if (
      parsed.data.AUTH_OTP_ENCRYPTION_KEY_BASE64 ===
      DEVELOPMENT_OTP_ENCRYPTION_KEY
    ) {
      productionIssues.push(
        "AUTH_OTP_ENCRYPTION_KEY_BASE64 must be replaced in production",
      );
    }
    if (parsed.data.EMAIL_PROVIDER !== "resend" || !parsed.data.RESEND_API_KEY) {
      productionIssues.push(
        "EMAIL_PROVIDER=resend and RESEND_API_KEY are required in production",
      );
    }
    if (
      parsed.data.PUSH_PROVIDER !== "firebase" ||
      !parsed.data.FCM_SERVICE_ACCOUNT_JSON_BASE64
    ) {
      productionIssues.push(
        "PUSH_PROVIDER=firebase and FCM_SERVICE_ACCOUNT_JSON_BASE64 are required in production",
      );
    }
    if (
      parsed.data.SMS_PROVIDER !== "twilio" ||
      !parsed.data.TWILIO_ACCOUNT_SID ||
      !parsed.data.TWILIO_AUTH_TOKEN ||
      (!parsed.data.TWILIO_MESSAGING_SERVICE_SID &&
        !parsed.data.TWILIO_FROM_NUMBER)
    ) {
      productionIssues.push(
        "SMS_PROVIDER=twilio and Twilio SMS credentials are required in production",
      );
    }
    if (productionIssues.length > 0) {
      throw new EnvValidationError(productionIssues);
    }
  }

  return Object.freeze({
    ...parsed.data,
    KAKAO_APP_ID: parsed.data.KAKAO_APP_ID,
    RESEND_API_KEY: parsed.data.RESEND_API_KEY,
    SMS_PROVIDER: parsed.data.SMS_PROVIDER,
    TWILIO_ACCOUNT_SID: parsed.data.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN: parsed.data.TWILIO_AUTH_TOKEN,
    TWILIO_MESSAGING_SERVICE_SID: parsed.data.TWILIO_MESSAGING_SERVICE_SID,
    TWILIO_FROM_NUMBER: parsed.data.TWILIO_FROM_NUMBER,
    FCM_SERVICE_ACCOUNT_JSON_BASE64:
      parsed.data.FCM_SERVICE_ACCOUNT_JSON_BASE64,
    CORS_ORIGINS: corsOrigins,
  });
}
