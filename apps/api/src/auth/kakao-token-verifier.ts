import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { z } from "zod";

import { ApiException } from "../common/http/api.exception";
import type { ApiEnv } from "../config/env";
import { API_ENV } from "../config/env.module";

const tokenInfoSchema = z.object({
  id: z.number().int().nonnegative(),
  app_id: z.number().int().positive(),
  expires_in: z.number().int().positive(),
});

const profileSchema = z.object({
  id: z.number().int().nonnegative(),
  kakao_account: z
    .object({
      profile: z.object({ nickname: z.string().optional() }).optional(),
    })
    .optional(),
});

export interface KakaoIdentity {
  providerAccountId: string;
  name: string;
}

@Injectable()
export class KakaoTokenVerifier {
  constructor(
    @Inject(API_ENV) private readonly env: Pick<ApiEnv, "KAKAO_APP_ID">,
  ) {}

  async verify(accessToken: string): Promise<KakaoIdentity> {
    if (!this.env.KAKAO_APP_ID) {
      throw new ApiException(
        HttpStatus.SERVICE_UNAVAILABLE,
        "KAKAO_NOT_CONFIGURED",
        "카카오 로그인을 사용할 수 없습니다.",
      );
    }

    const signal = AbortSignal.timeout(5_000);
    let tokenInfoResponse: Response;
    try {
      tokenInfoResponse = await fetch(
        "https://kapi.kakao.com/v1/user/access_token_info",
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal,
        },
      );
    } catch {
      throw this.unavailable();
    }

    const tokenInfo = tokenInfoResponse.ok
      ? tokenInfoSchema.safeParse(await this.readJson(tokenInfoResponse))
      : null;
    if (!tokenInfo?.success || tokenInfo.data.app_id !== this.env.KAKAO_APP_ID) {
      throw this.invalidToken();
    }

    let profileResponse: Response;
    try {
      profileResponse = await fetch("https://kapi.kakao.com/v2/user/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal,
      });
    } catch {
      throw this.unavailable();
    }

    const profile = profileResponse.ok
      ? profileSchema.safeParse(await this.readJson(profileResponse))
      : null;
    if (!profile?.success || profile.data.id !== tokenInfo.data.id) {
      throw this.invalidToken();
    }

    const nickname = profile.data.kakao_account?.profile?.nickname
      ?.trim()
      .replace(/\s+/g, " ");
    return {
      providerAccountId: String(profile.data.id),
      name:
        nickname && nickname.length >= 2
          ? Array.from(nickname).slice(0, 40).join("")
          : "카카오 회원",
    };
  }

  private async readJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  private invalidToken() {
    return new ApiException(
      HttpStatus.UNAUTHORIZED,
      "KAKAO_TOKEN_INVALID",
      "카카오 로그인 정보가 유효하지 않습니다. 다시 로그인해 주세요.",
    );
  }

  private unavailable() {
    return new ApiException(
      HttpStatus.SERVICE_UNAVAILABLE,
      "KAKAO_UNAVAILABLE",
      "카카오 로그인 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    );
  }
}
