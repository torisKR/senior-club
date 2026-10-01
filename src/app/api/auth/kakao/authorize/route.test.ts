import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { GET } from "./route";
import { kakaoStateCookieName } from "@/lib/auth/kakao-state";

afterEach(() => vi.unstubAllEnvs());
const origin = "https://club.test";

describe("Kakao authorize", () => {
  it.each(["", "?termsAccepted=1", "?privacyAccepted=1", "?termsAccepted=0&privacyAccepted=1", "?termsAccepted=1&termsAccepted=1&privacyAccepted=1"])("rejects absent or ambiguous consent %s before provider navigation", async (query) => {
    vi.stubEnv("KAKAO_REST_API_KEY", "key");
    const response = await GET(new Request(`${origin}/api/auth/kakao/authorize${query}`));
    const target = new URL(response.headers.get("location")!);
    expect(target.origin).toBe(origin);
    expect(target.pathname).toBe("/login");
    expect(target.searchParams.get("error")).toContain("동의");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("sanitizes external returnTo and sets a secure host-only production intent cookie", async () => {
    vi.stubEnv("KAKAO_REST_API_KEY", "key");
    vi.stubEnv("NODE_ENV", "production");
    const response = await GET(new Request(`${origin}/api/auth/kakao/authorize?termsAccepted=1&privacyAccepted=1&returnTo=https%3A%2F%2Fevil.test`));
    const target = new URL(response.headers.get("location")!);
    expect(target.origin).toBe("https://kauth.kakao.com");
    const intent = JSON.parse(Buffer.from(target.searchParams.get("state")!, "base64url").toString());
    expect(intent).toMatchObject({ returnTo: "/", termsAccepted: true, privacyAccepted: true });
    expect(intent.nonce).toBeTruthy();
    expect(intent.issuedAt).toBeGreaterThan(Date.now() - 1_000);
    const cookie = response.headers.get("set-cookie")!;
    for (const flag of [kakaoStateCookieName(), "HttpOnly", "Secure", "SameSite=lax", "Path=/", "Max-Age=600"]) expect(cookie).toContain(flag);
    expect(cookie).not.toContain("Domain=");
  });

  it("preserves the original safe destination on configuration failure", async () => {
    vi.stubEnv("KAKAO_REST_API_KEY", "");
    const response = await GET(new Request(`${origin}/api/auth/kakao/authorize?termsAccepted=1&privacyAccepted=1&returnTo=%2Fevents%2F1`));
    const target = new URL(response.headers.get("location")!);
    expect(target.pathname).toBe("/login");
    expect(target.searchParams.get("returnTo")).toBe("/events/1");
  });

  it("starts alias OAuth on the configured callback host before setting state", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("KAKAO_REST_API_KEY", "key");
    vi.stubEnv("KAKAO_REDIRECT_URI", "https://senior.toris.kr/api/auth/kakao/callback");
    const response = await GET(new Request("https://clubsenior.vercel.app/api/auth/kakao/authorize?termsAccepted=1&privacyAccepted=1&returnTo=%2Fevents%2F1"));
    const target = new URL(response.headers.get("location")!);
    expect(target.origin).toBe("https://senior.toris.kr");
    expect(target.pathname).toBe("/api/auth/kakao/authorize");
    expect(target.searchParams.get("returnTo")).toBe("/events/1");
    expect(target.searchParams.get("termsAccepted")).toBe("1");
    expect(target.searchParams.get("privacyAccepted")).toBe("1");
    expect(response.headers.has("set-cookie")).toBe(false);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
});
