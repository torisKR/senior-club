import { HttpStatus, Inject, Injectable, Logger } from "@nestjs/common";
import { getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

import { ApiException } from "../common/http/api.exception";
import type { ApiEnv } from "../config/env";
import { API_ENV } from "../config/env.module";
import { createFirebasePhoneCredential } from "./firebase-wif.credential";

export interface FirebasePhoneVerificationResult {
  phoneNumber: string;
  uid: string;
}

export const FIREBASE_PHONE_AUTH_MAX_AGE_SECONDS = 300;
const INVALID_TOKEN_CODES = new Set([
  "auth/argument-error", "auth/invalid-argument", "auth/invalid-id-token",
  "auth/id-token-expired", "auth/id-token-revoked", "auth/user-disabled",
  "auth/user-not-found",
]);

@Injectable()
export class FirebasePhoneService {
  private readonly logger = new Logger(FirebasePhoneService.name);
  private app: App | null = null;

  constructor(@Inject(API_ENV) private readonly env: ApiEnv) {}

  private getFirebaseApp(): App {
    if (this.app) return this.app;
    const projectId = this.env.FIREBASE_PROJECT_ID;
    if (!projectId) {
      throw new ApiException(
        HttpStatus.SERVICE_UNAVAILABLE,
        "FIREBASE_NOT_CONFIGURED",
        "휴대폰 인증 서비스를 사용할 수 없습니다.",
      );
    }
    // Separate from the push app: phone verification works with push disabled.
    // WIF uses rotating ECS task credentials; local development retains ADC.
    // client google-services.json is never treated as a server credential.
    const name = `senior-club-phone-auth-${projectId}`;
    this.app = getApps().find((entry) => entry.name === name) ?? initializeApp(
      { projectId, credential: createFirebasePhoneCredential(this.env) },
      name,
    );
    return this.app;
  }

  async verifyPhoneIdToken(idToken: string): Promise<FirebasePhoneVerificationResult> {
    if (typeof idToken !== "string" || !idToken.trim() || idToken.length > 8192) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_FIREBASE_TOKEN", "Firebase 토큰이 올바르지 않습니다.");
    }

    try {
      // The SDK verifies signature against cached Google certificates, issuer,
      // audience, expiry, and (with true) account disablement/token revocation.
      const decoded = await getAuth(this.getFirebaseApp()).verifyIdToken(idToken, true);
      const phoneNumber = decoded.phone_number;
      if (typeof phoneNumber !== "string" || !/^\+[1-9]\d{1,14}$/.test(phoneNumber)) {
        throw new ApiException(HttpStatus.UNAUTHORIZED, "FIREBASE_PHONE_NUMBER_INVALID", "유효한 휴대폰 인증 정보가 필요합니다.");
      }
      const phoneIdentities = decoded.firebase?.identities?.["phone"];
      if (
        decoded.firebase?.sign_in_provider !== "phone" ||
        !Array.isArray(phoneIdentities) || !phoneIdentities.includes(phoneNumber) ||
        typeof decoded.uid !== "string" || !decoded.uid || decoded.uid.length > 128
      ) {
        throw new ApiException(HttpStatus.UNAUTHORIZED, "FIREBASE_PHONE_AUTH_REQUIRED", "휴대폰 번호로 다시 인증해 주세요.");
      }
      const now = Math.floor(Date.now() / 1000);
      // auth_time records the actual sign-in. A recently refreshed iat cannot
      // substitute for fresh proof of possession of the phone number.
      if (
        !Number.isSafeInteger(decoded.auth_time) || decoded.auth_time <= 0 ||
        decoded.auth_time > now + 30 ||
        now - decoded.auth_time > FIREBASE_PHONE_AUTH_MAX_AGE_SECONDS
      ) {
        throw new ApiException(HttpStatus.UNAUTHORIZED, "FIREBASE_RECENT_AUTH_REQUIRED", "휴대폰 인증 시간이 만료되었습니다. 다시 인증해 주세요.");
      }
      return { phoneNumber, uid: decoded.uid };
    } catch (error) {
      if (error instanceof ApiException) throw error;
      const code = typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
        ? error.code : "unknown";
      // Never log the token, claims, phone number, or credential error message.
      this.logger.warn(`Firebase phone verification failed: ${/^[a-z/-]{1,80}$/.test(code) ? code : "unknown"}`);
      const invalid = INVALID_TOKEN_CODES.has(code);
      throw new ApiException(
        invalid ? HttpStatus.UNAUTHORIZED : HttpStatus.SERVICE_UNAVAILABLE,
        invalid ? "FIREBASE_TOKEN_INVALID" : "FIREBASE_UNAVAILABLE",
        invalid ? "유효하지 않은 Firebase 인증 토큰입니다. 다시 인증해 주세요." : "휴대폰 인증 서비스를 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.",
      );
    }
  }
}
