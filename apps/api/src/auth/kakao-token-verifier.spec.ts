import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiException } from "../common/http/api.exception";
import type { ApiEnv } from "../config/env";
import { KakaoTokenVerifier } from "./kakao-token-verifier";

const env = { KAKAO_APP_ID: 1_539_455 } satisfies Pick<ApiEnv, "KAKAO_APP_ID">;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function expectApiError(promise: Promise<unknown>, status: number, code: string) {
  try {
    await promise;
    throw new Error("Expected Kakao verification to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(ApiException);
    const exception = error as ApiException;
    expect(exception.getStatus()).toBe(status);
    expect(exception.getResponse()).toMatchObject({ error: { code } });
  }
}

describe("KakaoTokenVerifier", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("verifies the issuing app and returns the Kakao account identity", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ id: 7_777, app_id: env.KAKAO_APP_ID, expires_in: 3_600 }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: 7_777,
          kakao_account: { profile: { nickname: "홍 길동" } },
        }),
      );
    vi.stubGlobal("fetch", request);

    await expect(new KakaoTokenVerifier(env).verify("valid-access-token")).resolves.toEqual({
      providerAccountId: "7777",
      name: "홍 길동",
    });
    expect(request).toHaveBeenCalledTimes(2);
    expect(request).toHaveBeenNthCalledWith(
      1,
      "https://kapi.kakao.com/v1/user/access_token_info",
      expect.objectContaining({
        headers: { Authorization: "Bearer valid-access-token" },
      }),
    );
  });

  it("rejects a token issued to another Kakao app before reading the profile", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ id: 7_777, app_id: 999, expires_in: 3_600 }));
    vi.stubGlobal("fetch", request);

    await expectApiError(
      new KakaoTokenVerifier(env).verify("wrong-app-token"),
      401,
      "KAKAO_TOKEN_INVALID",
    );
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed Kakao responses", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ id: 7_777, app_id: env.KAKAO_APP_ID, expires_in: 3_600 }),
      )
      .mockResolvedValueOnce(jsonResponse({ id: "not-a-number" }));
    vi.stubGlobal("fetch", request);

    await expectApiError(
      new KakaoTokenVerifier(env).verify("malformed-profile-token"),
      401,
      "KAKAO_TOKEN_INVALID",
    );
  });

  it("reports Kakao network failures without accepting the login", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(new Error("offline")));

    await expectApiError(
      new KakaoTokenVerifier(env).verify("unreachable-token"),
      503,
      "KAKAO_UNAVAILABLE",
    );
  });
});
