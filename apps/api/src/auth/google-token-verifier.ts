import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { z } from "zod";

import { ApiException } from "../common/http/api.exception";
import type { ApiEnv } from "../config/env";
import { API_ENV } from "../config/env.module";

const tokenInfoSchema = z.object({
  sub: z.string().min(1),
  aud: z.string().optional(),
  email: z.string().optional(),
  email_verified: z.union([z.boolean(), z.string()]).optional(),
  name: z.string().optional(),
});

const userInfoSchema = z.object({
  sub: z.string().min(1),
  name: z.string().optional(),
  email: z.string().optional(),
  email_verified: z.boolean().optional(),
});

export interface GoogleIdentity {
  providerAccountId: string;
  name: string;
  email?: string;
}

export interface VerifyGoogleTokenInput {
  idToken?: string | undefined;
  accessToken?: string | undefined;
}

@Injectable()
export class GoogleTokenVerifier {
  constructor(
    @Inject(API_ENV) private readonly env: Pick<ApiEnv, "GOOGLE_CLIENT_ID">,
  ) {}

  async verify(input: VerifyGoogleTokenInput): Promise<GoogleIdentity> {
    if (!this.env.GOOGLE_CLIENT_ID) {
      throw new ApiException(
        HttpStatus.SERVICE_UNAVAILABLE,
        "GOOGLE_NOT_CONFIGURED",
        "구글 로그인을 사용할 수 없습니다.",
      );
    }

    if (!input.idToken && !input.accessToken) {
      throw this.invalidToken();
    }

    const signal = AbortSignal.timeout(5_000);

    if (input.idToken) {
      let response: Response;
      try {
        const url = new URL("https://oauth2.googleapis.com/tokeninfo");
        url.searchParams.set("id_token", input.idToken);
        response = await fetch(url.toString(), { signal });
      } catch {
        throw this.unavailable();
      }

      const parsed = response.ok
        ? tokenInfoSchema.safeParse(await this.readJson(response))
        : null;

      if (!parsed?.success) {
        throw this.invalidToken();
      }

      if (
        this.env.GOOGLE_CLIENT_ID &&
        parsed.data.aud &&
        parsed.data.aud !== this.env.GOOGLE_CLIENT_ID
      ) {
        throw this.invalidToken();
      }

      const name = parsed.data.name?.trim().replace(/\s+/g, " ");
      return {
        providerAccountId: parsed.data.sub,
        name:
          name && name.length >= 2
            ? Array.from(name).slice(0, 40).join("")
            : "구글 회원",
        ...(parsed.data.email
          ? { email: parsed.data.email.trim().toLocaleLowerCase("en-US") }
          : {}),
      };
    }

    if (input.accessToken) {
      let response: Response;
      try {
        response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
          headers: { Authorization: `Bearer ${input.accessToken}` },
          signal,
        });
      } catch {
        throw this.unavailable();
      }

      const parsed = response.ok
        ? userInfoSchema.safeParse(await this.readJson(response))
        : null;

      if (!parsed?.success) {
        throw this.invalidToken();
      }

      const name = parsed.data.name?.trim().replace(/\s+/g, " ");
      return {
        providerAccountId: parsed.data.sub,
        name:
          name && name.length >= 2
            ? Array.from(name).slice(0, 40).join("")
            : "구글 회원",
        ...(parsed.data.email
          ? { email: parsed.data.email.trim().toLocaleLowerCase("en-US") }
          : {}),
      };
    }

    throw this.invalidToken();
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
      "GOOGLE_TOKEN_INVALID",
      "구글 로그인 정보가 유효하지 않습니다. 다시 로그인해 주세요.",
    );
  }

  private unavailable() {
    return new ApiException(
      HttpStatus.SERVICE_UNAVAILABLE,
      "GOOGLE_UNAVAILABLE",
      "구글 로그인 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    );
  }
}
