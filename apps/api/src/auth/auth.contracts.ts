import { z } from "zod";

import { SessionClientType, UserRole } from "../generated/prisma/client";
import { normalizedPhoneNumber } from "./phone-number";

const normalizedEmail = z
  .email("올바른 이메일 주소를 입력해 주세요.")
  .max(254)
  .transform((value) => value.trim().toLocaleLowerCase("en-US"));

const displayName = z
  .string()
  .trim()
  .min(2, "이름은 2자 이상이어야 합니다.")
  .max(40, "이름은 40자 이하여야 합니다.")
  .transform((value) => value.replace(/\s+/g, " "));

export const requestEmailCodeSchema = z
  .object({ email: normalizedEmail })
  .strict();

export const verifyEmailCodeSchema = z
  .object({
    challengeId: z.string().min(8).max(128),
    email: normalizedEmail,
    code: z.string().regex(/^\d{6}$/, "인증번호 6자리를 입력해 주세요."),
    name: displayName,
    clientType: z.enum(SessionClientType).default(SessionClientType.WEB),
    termsAccepted: z.literal(true, {
      error: "서비스 이용약관 동의가 필요합니다.",
    }),
    privacyAccepted: z.literal(true, {
      error: "개인정보 처리방침 동의가 필요합니다.",
    }),
  })
  .strict();

export const requestPhoneCodeSchema = z
  .object({ phoneNumber: normalizedPhoneNumber })
  .strict();

export const verifyPhoneCodeSchema = z
  .object({
    challengeId: z.string().min(8).max(128),
    phoneNumber: normalizedPhoneNumber,
    code: z.string().regex(/^\d{6}$/, "인증번호 6자리를 입력해 주세요."),
    name: displayName,
    clientType: z.enum(SessionClientType).default(SessionClientType.WEB),
    termsAccepted: z.literal(true, {
      error: "서비스 이용약관 동의가 필요합니다.",
    }),
    privacyAccepted: z.literal(true, {
      error: "개인정보 처리방침 동의가 필요합니다.",
    }),
  })
  .strict();

export const kakaoLoginSchema = z
  .object({
    accessToken: z.string().trim().min(1).max(4_096),
    clientType: z.enum(SessionClientType).default(SessionClientType.WEB),
    termsAccepted: z.literal(true, {
      error: "서비스 이용약관 동의가 필요합니다.",
    }),
    privacyAccepted: z.literal(true, {
      error: "개인정보 처리방침 동의가 필요합니다.",
    }),
  })
  .strict();

export const refreshSessionSchema = z
  .object({ refreshToken: z.string().min(32).max(512) })
  .strict();

export type RequestEmailCodeInput = z.infer<typeof requestEmailCodeSchema>;
export type VerifyEmailCodeInput = z.infer<typeof verifyEmailCodeSchema>;
export type RequestPhoneCodeInput = z.infer<typeof requestPhoneCodeSchema>;
export type VerifyPhoneCodeInput = z.infer<typeof verifyPhoneCodeSchema>;
export type KakaoLoginInput = z.infer<typeof kakaoLoginSchema>;
export type RefreshSessionInput = z.infer<typeof refreshSessionSchema>;

export interface AuthenticatedPrincipal {
  userId: string;
  sessionId: string;
  role: UserRole;
}

export interface IssuedSession {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  sessionId: string;
  user: {
    id: string;
    email: string;
    phoneNumber: string | null;
    name: string;
    role: UserRole;
    onboardingCompletedAt: string | null;
  };
}
