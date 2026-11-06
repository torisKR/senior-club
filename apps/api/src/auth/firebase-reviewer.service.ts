import { HttpStatus, Inject, Injectable, Logger } from "@nestjs/common";
import { getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

import { ApiException } from "../common/http/api.exception";
import type { ApiEnv } from "../config/env";
import { API_ENV } from "../config/env.module";
import { createFirebasePhoneCredential } from "./firebase-wif.credential";

const INVALID_TOKEN_CODES = new Set([
  "auth/argument-error", "auth/invalid-argument", "auth/invalid-id-token",
  "auth/id-token-expired", "auth/id-token-revoked", "auth/user-disabled", "auth/user-not-found",
]);

@Injectable()
export class FirebaseReviewerService {
  private readonly logger = new Logger(FirebaseReviewerService.name);
  private app: App | null = null;

  constructor(@Inject(API_ENV) private readonly env: ApiEnv) {}

  private getFirebaseApp(): App {
    if (this.app) return this.app;
    const projectId = this.env.FIREBASE_PROJECT_ID;
    if (!projectId) throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "REVIEWER_LOGIN_UNAVAILABLE", "심사 계정 로그인을 사용할 수 없습니다.");
    const name = `senior-club-reviewer-auth-${projectId}`;
    this.app = getApps().find((entry) => entry.name === name) ?? initializeApp(
      { projectId, credential: createFirebasePhoneCredential(this.env) }, name,
    );
    return this.app;
  }

  async verify(idToken: string): Promise<{ uid: string }> {
    // A public Firebase API key or any other project's/user's valid token never
    // authorizes review access. Provisioned UID is server configuration only.
    const allowedUid = this.env.AUTH_REVIEWER_FIREBASE_UID;
    if (!allowedUid) throw new ApiException(HttpStatus.FORBIDDEN, "REVIEWER_LOGIN_DISABLED", "심사 계정 로그인이 설정되지 않았습니다.");
    if (typeof idToken !== "string" || idToken.trim().length < 20 || idToken.length > 8192) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_FIREBASE_TOKEN", "인증 정보가 올바르지 않습니다.");
    }
    try {
      // Validate issuer/audience/signature/expiry plus disabled/revoked users.
      const claims = await getAuth(this.getFirebaseApp()).verifyIdToken(idToken, true);
      const now = Math.floor(Date.now() / 1000);
      if (
        claims.uid !== allowedUid || claims.firebase?.sign_in_provider !== "password" ||
        typeof claims.email !== "string" || !claims.email ||
        !Array.isArray(claims.firebase.identities?.email) ||
        !claims.firebase.identities.email.includes(claims.email) ||
        !Number.isSafeInteger(claims.auth_time) || claims.auth_time <= 0 ||
        claims.auth_time > now + 30 || now - claims.auth_time > 300
      ) {
        throw new ApiException(HttpStatus.UNAUTHORIZED, "REVIEWER_CREDENTIALS_INVALID", "심사 계정의 로그인 정보를 확인해 주세요.");
      }
      return { uid: claims.uid };
    } catch (error) {
      if (error instanceof ApiException) throw error;
      const code = typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : "unknown";
      this.logger.warn(`Reviewer verification failed: ${/^[a-z/-]{1,80}$/.test(code) ? code : "unknown"}`);
      const invalid = INVALID_TOKEN_CODES.has(code);
      throw new ApiException(
        invalid ? HttpStatus.UNAUTHORIZED : HttpStatus.SERVICE_UNAVAILABLE,
        invalid ? "REVIEWER_CREDENTIALS_INVALID" : "REVIEWER_LOGIN_UNAVAILABLE",
        invalid ? "심사 계정의 로그인 정보를 확인해 주세요." : "심사 계정에 로그인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      );
    }
  }
}
