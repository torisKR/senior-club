import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiException } from "../common/http/api.exception";
import type { ApiEnv } from "../config/env";
import { GoogleTokenVerifier } from "./google-token-verifier";

const env = {
  GOOGLE_CLIENT_ID: "test-google-client-id.apps.googleusercontent.com",
} satisfies Pick<ApiEnv, "GOOGLE_CLIENT_ID">;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function expectApiError(
  promise: Promise<unknown>,
  status: number,
  code: string,
) {
  try {
    await promise;
    throw new Error("Expected Google verification to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(ApiException);
    const exception = error as ApiException;
    expect(exception.getStatus()).toBe(status);
    expect(exception.getResponse()).toMatchObject({ error: { code } });
  }
}

describe("GoogleTokenVerifier", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("verifies an ID token and returns Google identity", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        sub: "123456789",
        aud: env.GOOGLE_CLIENT_ID,
        name: "홍 길동",
        email: "HONG@example.com",
        email_verified: true,
      }),
    );
    vi.stubGlobal("fetch", request);

    await expect(
      new GoogleTokenVerifier(env).verify({ idToken: "valid-id-token" }),
    ).resolves.toEqual({
      providerAccountId: "123456789",
      name: "홍 길동",
      email: "hong@example.com",
    });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(
      expect.stringContaining("https://oauth2.googleapis.com/tokeninfo?id_token=valid-id-token"),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("verifies an access token via userinfo and returns Google identity", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        sub: "987654321",
        name: "김영희",
        email: "younghee@example.com",
        email_verified: true,
      }),
    );
    vi.stubGlobal("fetch", request);

    await expect(
      new GoogleTokenVerifier(env).verify({ accessToken: "valid-access-token" }),
    ).resolves.toEqual({
      providerAccountId: "987654321",
      name: "김영희",
      email: "younghee@example.com",
    });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(
      "https://www.googleapis.com/oauth2/v3/userinfo",
      expect.objectContaining({
        headers: { Authorization: "Bearer valid-access-token" },
      }),
    );
  });

  it("rejects an ID token issued for another client ID", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        sub: "123456789",
        aud: "wrong-client-id.apps.googleusercontent.com",
        name: "홍 길동",
      }),
    );
    vi.stubGlobal("fetch", request);

    await expectApiError(
      new GoogleTokenVerifier(env).verify({ idToken: "wrong-aud-token" }),
      401,
      "GOOGLE_TOKEN_INVALID",
    );
  });

  it("rejects malformed responses", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({ sub: "" }),
    );
    vi.stubGlobal("fetch", request);

    await expectApiError(
      new GoogleTokenVerifier(env).verify({ idToken: "malformed-token" }),
      401,
      "GOOGLE_TOKEN_INVALID",
    );
  });

  it("rejects when no token is provided", async () => {
    await expectApiError(
      new GoogleTokenVerifier(env).verify({}),
      401,
      "GOOGLE_TOKEN_INVALID",
    );
  });

  it("reports service unavailable when Google client ID is not configured", async () => {
    await expectApiError(
      new GoogleTokenVerifier({ GOOGLE_CLIENT_ID: undefined }).verify({
        idToken: "token",
      }),
      503,
      "GOOGLE_NOT_CONFIGURED",
    );
  });

  it("reports Google network failures as unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(new Error("network error")));

    await expectApiError(
      new GoogleTokenVerifier(env).verify({ idToken: "unreachable-token" }),
      503,
      "GOOGLE_UNAVAILABLE",
    );
  });
});
