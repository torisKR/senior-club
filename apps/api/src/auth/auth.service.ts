import { randomUUID } from "node:crypto";

import { HttpStatus, Inject, Injectable } from "@nestjs/common";

import { ApiException } from "../common/http/api.exception";
import type { ApiEnv } from "../config/env";
import { API_ENV } from "../config/env.module";
import {
  AuthProvider,
  ConsentDocumentType,
  UserStatus,
  VerificationPurpose,
} from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type {
  AuthenticatedPrincipal,
  IssuedSession,
  KakaoLoginInput,
  RequestEmailCodeInput,
  RequestPhoneCodeInput,
  VerifyEmailCodeInput,
  VerifyPhoneCodeInput,
} from "./auth.contracts";
import { KakaoTokenVerifier } from "./kakao-token-verifier";
import { TokenService } from "./token.service";

const OTP_MAX_ATTEMPTS = 5;
const OTP_REQUEST_WINDOW_MS = 10 * 60 * 1_000;
const OTP_REQUEST_LIMIT = 5;

type VerificationResult =
  | { status: "expired" | "invalid" | "locked" | "unavailable" }
  | {
      status: "verified";
      refreshToken: string;
      refreshTokenExpiresAt: Date;
      sessionId: string;
      user: {
        id: string;
        email: string | null;
        phoneNumber: string | null;
        name: string;
        role: IssuedSession["user"]["role"];
        onboardingCompletedAt: Date | null;
      };
    };

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly kakaoTokens: KakaoTokenVerifier,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  async requestEmailCode(input: RequestEmailCodeInput) {
    const now = new Date();
    const recentCount = await this.prisma.emailVerification.count({
      where: {
        email: input.email,
        purpose: VerificationPurpose.LOGIN,
        createdAt: { gte: new Date(now.getTime() - OTP_REQUEST_WINDOW_MS) },
      },
    });
    if (recentCount >= OTP_REQUEST_LIMIT) {
      throw new ApiException(
        HttpStatus.TOO_MANY_REQUESTS,
        "OTP_RATE_LIMITED",
        "인증번호 요청이 너무 많습니다. 10분 뒤 다시 시도해 주세요.",
      );
    }

    const id = randomUUID();
    const code = this.tokens.createOtpCode();
    const expiresAt = new Date(
      now.getTime() + this.env.AUTH_OTP_TTL_SECONDS * 1_000,
    );
    const sealedCode = this.tokens.sealOtp(code);

    await this.prisma.$transaction([
      this.prisma.emailVerification.create({
        data: {
          id,
          email: input.email,
          purpose: VerificationPurpose.LOGIN,
          codeHash: this.tokens.hashOtp(id, input.email, code),
          expiresAt,
        },
      }),
      this.prisma.outboxEvent.create({
        data: {
          type: "AUTH_OTP_REQUESTED",
          aggregateType: "EmailVerification",
          aggregateId: id,
          dedupKey: `auth-otp:${id}`,
          payload: {
            challengeId: id,
            email: input.email,
            sealedCode,
            expiresAt: expiresAt.toISOString(),
          },
        },
      }),
    ]);

    return {
      challengeId: id,
      expiresAt: expiresAt.toISOString(),
      retryAfterSeconds: 60,
      ...(this.env.NODE_ENV !== "production" && this.env.AUTH_DEV_OTP_EXPOSE
        ? { devCode: code }
        : {}),
    };
  }

  async requestPhoneCode(input: RequestPhoneCodeInput) {
    const now = new Date();
    const recentCount = await this.prisma.phoneVerification.count({
      where: {
        phoneNumber: input.phoneNumber,
        purpose: VerificationPurpose.LOGIN,
        createdAt: { gte: new Date(now.getTime() - OTP_REQUEST_WINDOW_MS) },
      },
    });
    if (recentCount >= OTP_REQUEST_LIMIT) {
      throw new ApiException(
        HttpStatus.TOO_MANY_REQUESTS,
        "OTP_RATE_LIMITED",
        "인증번호 요청이 너무 많습니다. 10분 뒤 다시 시도해 주세요.",
      );
    }

    const id = randomUUID();
    const code = this.tokens.createOtpCode();
    const expiresAt = new Date(
      now.getTime() + this.env.AUTH_OTP_TTL_SECONDS * 1_000,
    );
    const sealedCode = this.tokens.sealOtp(code);

    await this.prisma.$transaction([
      this.prisma.phoneVerification.create({
        data: {
          id,
          phoneNumber: input.phoneNumber,
          purpose: VerificationPurpose.LOGIN,
          codeHash: this.tokens.hashOtp(id, input.phoneNumber, code),
          expiresAt,
        },
      }),
      this.prisma.outboxEvent.create({
        data: {
          type: "AUTH_PHONE_OTP_REQUESTED",
          aggregateType: "PhoneVerification",
          aggregateId: id,
          dedupKey: `auth-otp:${id}`,
          payload: {
            challengeId: id,
            phoneNumber: input.phoneNumber,
            sealedCode,
            expiresAt: expiresAt.toISOString(),
          },
        },
      }),
    ]);

    return {
      challengeId: id,
      phoneNumber: input.phoneNumber,
      expiresAt: expiresAt.toISOString(),
      retryAfterSeconds: 60,
      ...(this.env.NODE_ENV !== "production" && this.env.AUTH_DEV_OTP_EXPOSE
        ? { devCode: code }
        : {}),
    };
  }

  async verifyEmailCode(
    input: VerifyEmailCodeInput,
    device: { userAgent?: string; ipAddress?: string },
  ): Promise<IssuedSession> {
    const now = new Date();
    const refresh = this.tokens.createRefreshToken();
    const refreshTokenExpiresAt = new Date(
      now.getTime() + this.env.AUTH_REFRESH_TOKEN_TTL_DAYS * 86_400_000,
    );

    const result = await this.prisma.$transaction<VerificationResult>(
      async (transaction) => {
        await transaction.$queryRaw`
          SELECT "id"
          FROM "email_verifications"
          WHERE "id" = ${input.challengeId}
          FOR UPDATE
        `;
        const challenge = await transaction.emailVerification.findUnique({
          where: { id: input.challengeId },
        });

        if (
          !challenge ||
          challenge.email !== input.email ||
          challenge.purpose !== VerificationPurpose.LOGIN ||
          challenge.consumedAt ||
          challenge.expiresAt <= now
        ) {
          return { status: "expired" };
        }
        if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
          return { status: "locked" };
        }
        if (
          !this.tokens.otpMatches(
            challenge.codeHash,
            challenge.id,
            challenge.email,
            input.code,
          )
        ) {
          const attempts = challenge.attempts + 1;
          await transaction.emailVerification.update({
            where: { id: challenge.id },
            data: { attempts },
          });
          return { status: attempts >= OTP_MAX_ATTEMPTS ? "locked" : "invalid" };
        }

        const existing = await transaction.user.findUnique({
          where: { email: input.email },
          select: { status: true },
        });
        if (existing && existing.status !== UserStatus.ACTIVE) {
          return { status: "unavailable" };
        }

        const user = await transaction.user.upsert({
          where: { email: input.email },
          update: { emailVerifiedAt: now, lastLoginAt: now },
          create: {
            email: input.email,
            name: input.name,
            emailVerifiedAt: now,
            lastLoginAt: now,
            termsAgreedAt: now,
          },
          select: {
            id: true,
            email: true,
            phoneNumber: true,
            name: true,
            role: true,
            onboardingCompletedAt: true,
          },
        });

        for (const documentType of [
          ConsentDocumentType.TERMS,
          ConsentDocumentType.PRIVACY,
        ]) {
          await transaction.consentRecord.upsert({
            where: {
              userId_documentType_version: {
                userId: user.id,
                documentType,
                version: this.env.CONSENT_DOCUMENT_VERSION,
              },
            },
            update: { granted: true, withdrawnAt: null, recordedAt: now },
            create: {
              userId: user.id,
              documentType,
              version: this.env.CONSENT_DOCUMENT_VERSION,
              granted: true,
              source: input.clientType.toLocaleLowerCase("en-US"),
            },
          });
        }

        await transaction.notificationPreference.upsert({
          where: { userId: user.id },
          update: {},
          create: { userId: user.id },
        });
        await transaction.emailVerification.update({
          where: { id: challenge.id },
          data: { consumedAt: now },
        });
        const session = await transaction.authSession.create({
          data: {
            userId: user.id,
            refreshTokenHash: refresh.hash,
            clientType: input.clientType,
            expiresAt: refreshTokenExpiresAt,
            ...(device.userAgent ? { userAgent: device.userAgent.slice(0, 500) } : {}),
            ...(device.ipAddress
              ? { ipHash: this.tokens.hashIpAddress(device.ipAddress) }
              : {}),
          },
          select: { id: true },
        });

        return {
          status: "verified",
          refreshToken: refresh.token,
          refreshTokenExpiresAt,
          sessionId: session.id,
          user,
        };
      },
    );

    if (result.status !== "verified") {
      if (result.status === "locked") {
        throw new ApiException(
          HttpStatus.TOO_MANY_REQUESTS,
          "OTP_ATTEMPTS_EXCEEDED",
          "인증번호 입력 횟수를 초과했습니다. 새 인증번호를 요청해 주세요.",
        );
      }
      if (result.status === "unavailable") {
        throw new ApiException(
          HttpStatus.FORBIDDEN,
          "ACCOUNT_UNAVAILABLE",
          "이 계정으로 로그인할 수 없습니다. 고객센터에 문의해 주세요.",
        );
      }
      throw new ApiException(
        result.status === "expired" ? HttpStatus.GONE : HttpStatus.UNAUTHORIZED,
        result.status === "expired" ? "OTP_EXPIRED" : "OTP_INVALID",
        result.status === "expired"
          ? "인증번호가 만료되었습니다. 새 번호를 요청해 주세요."
          : "인증번호가 올바르지 않습니다.",
      );
    }

    return this.formatIssuedSession(result);
  }

  async verifyPhoneCode(
    input: VerifyPhoneCodeInput,
    device: { userAgent?: string; ipAddress?: string },
  ): Promise<IssuedSession> {
    const now = new Date();
    const refresh = this.tokens.createRefreshToken();
    const refreshTokenExpiresAt = new Date(
      now.getTime() + this.env.AUTH_REFRESH_TOKEN_TTL_DAYS * 86_400_000,
    );

    const result = await this.prisma.$transaction<VerificationResult>(
      async (transaction) => {
        await transaction.$queryRaw`
          SELECT "id"
          FROM "phone_verifications"
          WHERE "id" = ${input.challengeId}
          FOR UPDATE
        `;
        const challenge = await transaction.phoneVerification.findUnique({
          where: { id: input.challengeId },
        });

        if (
          !challenge ||
          challenge.phoneNumber !== input.phoneNumber ||
          challenge.purpose !== VerificationPurpose.LOGIN ||
          challenge.consumedAt ||
          challenge.expiresAt <= now
        ) {
          return { status: "expired" };
        }
        if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
          return { status: "locked" };
        }
        if (
          !this.tokens.otpMatches(
            challenge.codeHash,
            challenge.id,
            challenge.phoneNumber,
            input.code,
          )
        ) {
          const attempts = challenge.attempts + 1;
          await transaction.phoneVerification.update({
            where: { id: challenge.id },
            data: { attempts },
          });
          return { status: attempts >= OTP_MAX_ATTEMPTS ? "locked" : "invalid" };
        }

        const existing = await transaction.user.findUnique({
          where: { phoneNumber: input.phoneNumber },
          select: { status: true },
        });
        if (existing && existing.status !== UserStatus.ACTIVE) {
          return { status: "unavailable" };
        }

        const user = await transaction.user.upsert({
          where: { phoneNumber: input.phoneNumber },
          update: { phoneVerifiedAt: now, lastLoginAt: now },
          create: {
            phoneNumber: input.phoneNumber,
            name: input.name,
            phoneVerifiedAt: now,
            lastLoginAt: now,
            termsAgreedAt: now,
          },
          select: {
            id: true,
            email: true,
            phoneNumber: true,
            name: true,
            role: true,
            onboardingCompletedAt: true,
          },
        });

        for (const documentType of [
          ConsentDocumentType.TERMS,
          ConsentDocumentType.PRIVACY,
        ]) {
          await transaction.consentRecord.upsert({
            where: {
              userId_documentType_version: {
                userId: user.id,
                documentType,
                version: this.env.CONSENT_DOCUMENT_VERSION,
              },
            },
            update: { granted: true, withdrawnAt: null, recordedAt: now },
            create: {
              userId: user.id,
              documentType,
              version: this.env.CONSENT_DOCUMENT_VERSION,
              granted: true,
              source: input.clientType.toLocaleLowerCase("en-US"),
            },
          });
        }

        await transaction.notificationPreference.upsert({
          where: { userId: user.id },
          update: {},
          create: { userId: user.id },
        });
        await transaction.phoneVerification.update({
          where: { id: challenge.id },
          data: { consumedAt: now, userId: user.id },
        });
        const session = await transaction.authSession.create({
          data: {
            userId: user.id,
            refreshTokenHash: refresh.hash,
            clientType: input.clientType,
            expiresAt: refreshTokenExpiresAt,
            ...(device.userAgent ? { userAgent: device.userAgent.slice(0, 500) } : {}),
            ...(device.ipAddress
              ? { ipHash: this.tokens.hashIpAddress(device.ipAddress) }
              : {}),
          },
          select: { id: true },
        });

        return {
          status: "verified",
          refreshToken: refresh.token,
          refreshTokenExpiresAt,
          sessionId: session.id,
          user,
        };
      },
    );

    if (result.status !== "verified") {
      if (result.status === "locked") {
        throw new ApiException(
          HttpStatus.TOO_MANY_REQUESTS,
          "OTP_ATTEMPTS_EXCEEDED",
          "인증번호 입력 횟수를 초과했습니다. 새 인증번호를 요청해 주세요.",
        );
      }
      if (result.status === "unavailable") {
        throw new ApiException(
          HttpStatus.FORBIDDEN,
          "ACCOUNT_UNAVAILABLE",
          "이 계정으로 로그인할 수 없습니다. 고객센터에 문의해 주세요.",
        );
      }
      throw new ApiException(
        result.status === "expired" ? HttpStatus.GONE : HttpStatus.UNAUTHORIZED,
        result.status === "expired" ? "OTP_EXPIRED" : "OTP_INVALID",
        result.status === "expired"
          ? "인증번호가 만료되었습니다. 새 번호를 요청해 주세요."
          : "인증번호가 올바르지 않습니다.",
      );
    }

    return this.formatIssuedSession(result);
  }

  async loginWithKakao(
    input: KakaoLoginInput,
    device: { userAgent?: string; ipAddress?: string },
  ): Promise<IssuedSession> {
    const identity = await this.kakaoTokens.verify(input.accessToken);
    const now = new Date();
    const refresh = this.tokens.createRefreshToken();
    const refreshTokenExpiresAt = new Date(
      now.getTime() + this.env.AUTH_REFRESH_TOKEN_TTL_DAYS * 86_400_000,
    );

    const result = await this.prisma.$transaction<VerificationResult>(
      async (transaction) => {
        const lockKey = `kakao:${identity.providerAccountId}`;
        await transaction.$queryRaw`
          SELECT pg_advisory_xact_lock(hashtext(${lockKey}))
        `;

        const existingIdentity = await transaction.authIdentity.findUnique({
          where: {
            provider_providerAccountId: {
              provider: AuthProvider.KAKAO,
              providerAccountId: identity.providerAccountId,
            },
          },
          select: {
            user: {
              select: {
                id: true,
                email: true,
                phoneNumber: true,
                name: true,
                role: true,
                status: true,
                onboardingCompletedAt: true,
              },
            },
          },
        });

        if (
          existingIdentity &&
          existingIdentity.user.status !== UserStatus.ACTIVE
        ) {
          return { status: "unavailable" };
        }

        const user = existingIdentity
          ? await transaction.user.update({
              where: { id: existingIdentity.user.id },
              data: { lastLoginAt: now },
              select: {
                id: true,
                email: true,
                phoneNumber: true,
                name: true,
                role: true,
                onboardingCompletedAt: true,
              },
            })
          : await transaction.user.create({
              data: {
                name: identity.name,
                lastLoginAt: now,
                termsAgreedAt: now,
                authIdentities: {
                  create: {
                    provider: AuthProvider.KAKAO,
                    providerAccountId: identity.providerAccountId,
                  },
                },
              },
              select: {
                id: true,
                email: true,
                phoneNumber: true,
                name: true,
                role: true,
                onboardingCompletedAt: true,
              },
            });

        for (const documentType of [
          ConsentDocumentType.TERMS,
          ConsentDocumentType.PRIVACY,
        ]) {
          await transaction.consentRecord.upsert({
            where: {
              userId_documentType_version: {
                userId: user.id,
                documentType,
                version: this.env.CONSENT_DOCUMENT_VERSION,
              },
            },
            update: { granted: true, withdrawnAt: null, recordedAt: now },
            create: {
              userId: user.id,
              documentType,
              version: this.env.CONSENT_DOCUMENT_VERSION,
              granted: true,
              source: input.clientType.toLocaleLowerCase("en-US"),
            },
          });
        }

        await transaction.notificationPreference.upsert({
          where: { userId: user.id },
          update: {},
          create: { userId: user.id },
        });
        const session = await transaction.authSession.create({
          data: {
            userId: user.id,
            refreshTokenHash: refresh.hash,
            clientType: input.clientType,
            expiresAt: refreshTokenExpiresAt,
            ...(device.userAgent ? { userAgent: device.userAgent.slice(0, 500) } : {}),
            ...(device.ipAddress
              ? { ipHash: this.tokens.hashIpAddress(device.ipAddress) }
              : {}),
          },
          select: { id: true },
        });

        return {
          status: "verified",
          refreshToken: refresh.token,
          refreshTokenExpiresAt,
          sessionId: session.id,
          user,
        };
      },
    );

    if (result.status !== "verified") {
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        "ACCOUNT_UNAVAILABLE",
        "이 계정으로 로그인할 수 없습니다. 고객센터에 문의해 주세요.",
      );
    }

    return this.formatIssuedSession(result);
  }

  async refreshSession(refreshToken: string): Promise<IssuedSession> {
    const now = new Date();
    const currentHash = this.tokens.hashRefreshToken(refreshToken);
    const nextRefresh = this.tokens.createRefreshToken();

    const result = await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT "id"
        FROM "auth_sessions"
        WHERE "refresh_token_hash" = ${currentHash}
        FOR UPDATE
      `;
      const session = await transaction.authSession.findUnique({
        where: { refreshTokenHash: currentHash },
        select: {
          id: true,
          expiresAt: true,
          revokedAt: true,
          user: {
            select: {
              id: true,
              email: true,
              phoneNumber: true,
              name: true,
              role: true,
              status: true,
              onboardingCompletedAt: true,
            },
          },
        },
      });
      if (
        !session ||
        session.revokedAt ||
        session.expiresAt <= now ||
        session.user.status !== UserStatus.ACTIVE
      ) {
        return null;
      }

      await transaction.authSession.update({
        where: { id: session.id },
        data: { refreshTokenHash: nextRefresh.hash, lastUsedAt: now },
      });
      return {
        refreshToken: nextRefresh.token,
        refreshTokenExpiresAt: session.expiresAt,
        sessionId: session.id,
        user: session.user,
      };
    });

    if (!result) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        "INVALID_REFRESH_TOKEN",
        "로그인 시간이 만료되었습니다. 다시 로그인해 주세요.",
      );
    }
    return this.formatIssuedSession(result);
  }

  async logout(refreshToken: string) {
    const refreshTokenHash = this.tokens.hashRefreshToken(refreshToken);
    await this.prisma.authSession.updateMany({
      where: { refreshTokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { success: true as const };
  }

  async getMe(principal: AuthenticatedPrincipal) {
    const user = await this.prisma.user.findUnique({
      where: { id: principal.userId },
      select: {
        id: true,
        email: true,
        phoneNumber: true,
        name: true,
        birthYear: true,
        region: true,
        gender: true,
        avatarUrl: true,
        bio: true,
        role: true,
        onboardingCompletedAt: true,
        interests: {
          select: { interest: { select: { id: true, slug: true, name: true, icon: true } } },
          orderBy: { selectedAt: "asc" },
        },
        notificationPreference: true,
      },
    });
    if (!user) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        "USER_NOT_FOUND",
        "회원 정보를 찾을 수 없습니다.",
      );
    }
    return {
      ...user,
      email: user.email ?? "",
      interests: user.interests.map((entry) => entry.interest),
    };
  }

  private async formatIssuedSession(result: {
    refreshToken: string;
    refreshTokenExpiresAt: Date;
    sessionId: string;
    user: {
      id: string;
      email: string | null;
      phoneNumber: string | null;
      name: string;
      role: IssuedSession["user"]["role"];
      onboardingCompletedAt: Date | null;
    };
  }): Promise<IssuedSession> {
    const access = await this.tokens.signAccessToken({
      userId: result.user.id,
      sessionId: result.sessionId,
      role: result.user.role,
    });
    return {
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt.toISOString(),
      refreshToken: result.refreshToken,
      refreshTokenExpiresAt: result.refreshTokenExpiresAt.toISOString(),
      sessionId: result.sessionId,
      user: {
        ...result.user,
        email: result.user.email ?? "",
        onboardingCompletedAt:
          result.user.onboardingCompletedAt?.toISOString() ?? null,
      },
    };
  }
}
