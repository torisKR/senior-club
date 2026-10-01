import { fromContainerMetadata } from "@aws-sdk/credential-providers";
import { applicationDefault, type Credential, type GoogleOAuthAccessToken } from "firebase-admin/app";
import { AwsClient, type AwsSecurityCredentials, type AwsSecurityCredentialsSupplier } from "google-auth-library";

import {
  type ApiEnv, FIREBASE_WIF_AUDIENCE_PATTERN,
  FIREBASE_WIF_REGION_PATTERN, FIREBASE_WIF_SERVICE_ACCOUNT_PATTERN,
} from "../config/env";

const AWS_REFRESH_WINDOW_MS = 60_000;
type ContainerCredentialsProvider = ReturnType<typeof fromContainerMetadata>;
type ContainerCredentials = Awaited<ReturnType<ContainerCredentialsProvider>>;

// Use only the ECS provider: a general AWS chain could pick static keys or EC2.
class EcsSecurityCredentialsSupplier implements AwsSecurityCredentialsSupplier {
  private cached: ContainerCredentials | undefined;
  private pending: Promise<ContainerCredentials> | undefined;

  constructor(
    private readonly region: string,
    private readonly provider: ContainerCredentialsProvider = fromContainerMetadata({ timeout: 1_000, maxRetries: 1 }),
  ) {}

  async getAwsRegion(): Promise<string> {
    return this.region;
  }

  async getAwsSecurityCredentials(): Promise<AwsSecurityCredentials> {
    if (!this.cached?.expiration || this.cached.expiration.getTime() - Date.now() <= AWS_REFRESH_WINDOW_MS) {
      // Fargate injects this relative path. Never allow FULL_URI to redirect
      // credential retrieval to an endpoint supplied by deployment config.
      if (!/^\/v2\/credentials\/[a-f0-9-]{36}$/.test(process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI ?? "")) {
        throw new Error("ECS task credential endpoint unavailable");
      }
      this.pending ??= this.provider();
      try {
        const credentials = await this.pending;
        if (
          !credentials.accessKeyId || !credentials.secretAccessKey || !credentials.sessionToken ||
          !credentials.expiration || !Number.isFinite(credentials.expiration.getTime()) ||
          credentials.expiration.getTime() <= Date.now()
        ) {
          throw new Error("Invalid ECS task credentials");
        }
        this.cached = credentials;
      } finally {
        this.pending = undefined;
      }
    }
    return {
      accessKeyId: this.cached.accessKeyId,
      secretAccessKey: this.cached.secretAccessKey,
      token: this.cached.sessionToken!,
    };
  }
}

export function createFirebasePhoneCredential(env: ApiEnv): Credential {
  if (env.FIREBASE_WIF_AUDIENCE === undefined && env.FIREBASE_WIF_SERVICE_ACCOUNT_EMAIL === undefined) {
    return applicationDefault();
  }
  // Defend the credential boundary too, even if a caller bypasses parseApiEnv.
  if (
    !env.FIREBASE_PROJECT_ID || !env.FIREBASE_WIF_AUDIENCE ||
    !FIREBASE_WIF_AUDIENCE_PATTERN.test(env.FIREBASE_WIF_AUDIENCE) ||
    !env.FIREBASE_WIF_SERVICE_ACCOUNT_EMAIL ||
    !FIREBASE_WIF_SERVICE_ACCOUNT_PATTERN.test(env.FIREBASE_WIF_SERVICE_ACCOUNT_EMAIL) ||
    !env.AWS_REGION || !FIREBASE_WIF_REGION_PATTERN.test(env.AWS_REGION)
  ) {
    throw new Error("Invalid Firebase WIF configuration");
  }

  const client = new AwsClient({
    audience: env.FIREBASE_WIF_AUDIENCE,
    subject_token_type: "urn:ietf:params:aws:token-type:aws4_request",
    token_url: "https://sts.googleapis.com/v1/token",
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${env.FIREBASE_WIF_SERVICE_ACCOUNT_EMAIL}:generateAccessToken`,
    service_account_impersonation: { token_lifetime_seconds: 3_600 },
    scopes: ["https://www.googleapis.com/auth/identitytoolkit"],
    aws_security_credentials_supplier: new EcsSecurityCredentialsSupplier(env.AWS_REGION),
  });

  return {
    async getAccessToken(): Promise<GoogleOAuthAccessToken> {
      try {
        // AwsClient caches/refreshes Google tokens and coalesces refresh calls.
        const { token } = await client.getAccessToken();
        const expiresIn = Math.floor(((client.credentials.expiry_date ?? 0) - Date.now()) / 1_000);
        if (typeof token !== "string" || !token || !Number.isSafeInteger(expiresIn) || expiresIn <= 0) {
          throw new Error("Invalid Google access token");
        }
        return { access_token: token, expires_in: expiresIn };
      } catch {
        // Transport errors can contain signed AWS assertions or bearer tokens.
        throw new Error("Firebase WIF credential unavailable");
      }
    },
  };
}
