import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

describe("Kakao OAuth helpers", () => {
  beforeEach(() => { vi.stubEnv("KAKAO_REST_API_KEY", "test-key"); vi.stubEnv("KAKAO_CLIENT_SECRET", "test-secret"); });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); });

  it("builds an encoded authorize URL", async () => {
    const { getKakaoAuthorizeUrl } = await import("./kakao");
    const url = new URL(getKakaoAuthorizeUrl("https://example.test/callback", "a b"));
    expect(url.searchParams.get("client_id")).toBe("test-key");
    expect(url.searchParams.get("redirect_uri")).toBe("https://example.test/callback");
    expect(url.searchParams.get("state")).toBe("a b");
  });

  it("uses the callback URL when optional redirect configuration is blank", async () => {
    vi.stubEnv("KAKAO_REDIRECT_URI", "  ");
    const { kakaoRedirectUri } = await import("./kakao");
    expect(kakaoRedirectUri("https://senior.toris.kr")).toBe("https://senior.toris.kr/api/auth/kakao/callback");
  });

  it("exchanges a code with bounded fetch and returns access token", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: "token" }), { status: 200 })));
    const { exchangeKakaoCodeForToken } = await import("./kakao");
    await expect(exchangeKakaoCodeForToken("code", "https://example.test/callback")).resolves.toEqual({ access_token: "token" });
    expect(fetch).toHaveBeenCalledWith("https://kauth.kakao.com/oauth/token", expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });
});
