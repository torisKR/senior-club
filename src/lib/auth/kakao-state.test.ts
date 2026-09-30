import { afterEach, describe, expect, it, vi } from "vitest";
import { createKakaoState, kakaoStateCookieName, readKakaoIntent } from "./kakao-state";

afterEach(() => vi.unstubAllEnvs());

function request(state: string, cookie = `${kakaoStateCookieName()}=${state}`, extraQuery = "") {
  return new Request(`https://club.test/api/auth/kakao/callback?state=${state}${extraQuery}`, { headers: { cookie } });
}

function changedState(fields: Record<string, unknown>) {
  const state = JSON.parse(Buffer.from(createKakaoState("/events/1"), "base64url").toString());
  return Buffer.from(JSON.stringify({ ...state, ...fields })).toString("base64url");
}

describe("Kakao OAuth intent", () => {
  it("matches a fresh intent with consent and a safe return destination", () => {
    const state = createKakaoState("/events/1");
    expect(readKakaoIntent(request(state))).toEqual({ returnTo: "/events/1" });
    const external = createKakaoState("https://evil.test/");
    expect(readKakaoIntent(request(external))).toEqual({ returnTo: "/" });
  });

  it.each([
    { issuedAt: Date.now() - 601_000 },
    { issuedAt: Date.now() + 60_000 },
    { nonce: "" },
    { nonce: 123 },
    { termsAccepted: false },
    { privacyAccepted: "true" },
    { returnTo: {} },
  ])("rejects invalid or expired intent %j", (fields) => {
    const state = changedState(fields);
    expect(readKakaoIntent(request(state))).toBeNull();
  });

  it("rejects ambiguous cookie and query values", () => {
    const state = createKakaoState("/");
    expect(readKakaoIntent(request(state, ""))).toBeNull();
    expect(readKakaoIntent(request(state, `${kakaoStateCookieName()}=other`))).toBeNull();
    expect(readKakaoIntent(request(state, `${kakaoStateCookieName()}=${state}; ${kakaoStateCookieName()}=${state}`))).toBeNull();
    expect(readKakaoIntent(request(state, undefined, `&state=${state}`))).toBeNull();
    expect(readKakaoIntent(request("not-json"))).toBeNull();
    expect(readKakaoIntent(request("s".repeat(2_049)))).toBeNull();
  });

  it("requires a host-prefixed cookie in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const state = createKakaoState("/");
    expect(kakaoStateCookieName()).toBe("__Host-senior_club_kakao_state");
    expect(readKakaoIntent(request(state, `kakao_oauth_state=${state}`))).toBeNull();
    expect(readKakaoIntent(request(state))).toEqual({ returnTo: "/" });
  });
});
