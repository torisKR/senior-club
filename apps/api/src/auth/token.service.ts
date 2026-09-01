import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import { jwtVerify, SignJWT } from "jose";

import type { ApiEnv } from "../config/env";
import { API_ENV } from "../config/env.module";
import { UserRole } from "../generated/prisma/client";
import type { AuthenticatedPrincipal } from "./auth.contracts";

const JWT_ISSUER = "senior-club-api";
const JWT_AUDIENCE = "senior-club-clients";

@Injectable()
export class TokenService {
  private readonly jwtKey: Uint8Array;
  private readonly otpEncryptionKey: Buffer;

  constructor(@Inject(API_ENV) private readonly env: ApiEnv) {
    this.jwtKey = new TextEncoder().encode(env.AUTH_ACCESS_TOKEN_SECRET);
    this.otpEncryptionKey = Buffer.from(
      env.AUTH_OTP_ENCRYPTION_KEY_BASE64,
      "base64",
    );
  }

  async signAccessToken(principal: AuthenticatedPrincipal) {
    const expiresAt = new Date(
      Date.now() + this.env.AUTH_ACCESS_TOKEN_TTL_SECONDS * 1_000,
    );
    const token = await new SignJWT({
      sid: principal.sessionId,
      role: principal.role,
      tokenType: "access",
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuer(JWT_ISSUER)
      .setAudience(JWT_AUDIENCE)
      .setSubject(principal.userId)
      .setIssuedAt()
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1_000))
      .sign(this.jwtKey);

    return { token, expiresAt };
  }

  async verifyAccessToken(token: string): Promise<AuthenticatedPrincipal> {
    const { payload } = await jwtVerify(token, this.jwtKey, {
      algorithms: ["HS256"],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });

    if (
      typeof payload.sub !== "string" ||
      typeof payload.sid !== "string" ||
      payload.tokenType !== "access" ||
      typeof payload.role !== "string" ||
      !Object.values(UserRole).includes(payload.role as UserRole)
    ) {
      throw new Error("Invalid access token claims");
    }

    return {
      userId: payload.sub,
      sessionId: payload.sid,
      role: payload.role as UserRole,
    };
  }

  createRefreshToken() {
    const token = randomBytes(48).toString("base64url");
    return { token, hash: this.hashRefreshToken(token) };
  }

  hashRefreshToken(token: string) {
    return createHash("sha256").update(token, "utf8").digest("base64url");
  }

  hashIpAddress(address: string) {
    return createHmac("sha256", this.env.AUTH_OTP_PEPPER)
      .update(address, "utf8")
      .digest("base64url");
  }

  createOtpCode() {
    const value = randomBytes(4).readUInt32BE(0) % 1_000_000;
    return value.toString().padStart(6, "0");
  }

  hashOtp(challengeId: string, email: string, code: string) {
    return createHmac("sha256", this.env.AUTH_OTP_PEPPER)
      .update(`${challengeId}\n${email}\n${code}`, "utf8")
      .digest("base64url");
  }

  otpMatches(
    expectedHash: string,
    challengeId: string,
    email: string,
    code: string,
  ) {
    const actual = Buffer.from(
      this.hashOtp(challengeId, email, code),
      "utf8",
    );
    const expected = Buffer.from(expectedHash, "utf8");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  sealOtp(code: string) {
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.otpEncryptionKey, nonce);
    const ciphertext = Buffer.concat([
      cipher.update(code, "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return [nonce, tag, ciphertext]
      .map((value) => value.toString("base64url"))
      .join(".");
  }

  openOtp(sealed: string) {
    const parts = sealed.split(".");
    if (parts.length !== 3) throw new Error("Invalid sealed OTP");
    const [nonceValue, tagValue, ciphertextValue] = parts;
    if (!nonceValue || !tagValue || !ciphertextValue) {
      throw new Error("Invalid sealed OTP");
    }
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.otpEncryptionKey,
      Buffer.from(nonceValue, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextValue, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  }
}
