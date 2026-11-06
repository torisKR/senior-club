import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ exchange: vi.fn(), post: vi.fn(), set: vi.fn() }));
vi.mock("@/lib/auth/kakao", async (original) => ({ ...(await original<typeof import("@/lib/auth/kakao")>()), exchangeKakaoCode: mocks.exchange }));
vi.mock("@/lib/auth/bff", () => ({ backendApi: () => ({ post: mocks.post }), setSessionCookies: mocks.set }));
import { GET } from "./route";
import { createKakaoState, kakaoStateCookieName } from "@/lib/auth/kakao-state";

const session = { user: { id: "u", email: null, name: "카카오 회원", role: "MEMBER", onboardingCompletedAt: "2026-01-01" } };
function request(query: string, state?: string) {
  return new Request(`https://club.test/api/auth/kakao/callback?${query}`, { headers: state ? { cookie: `${kakaoStateCookieName()}=${state}` } : {} });
}
function location(response: Response) { return new URL(response.headers.get("location")!); }

describe("Kakao callback", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.exchange.mockResolvedValue({ access_token: "ka" }); mocks.post.mockResolvedValue(session); });
  it.each(["missing", "mismatch"])("rejects %s state without calling upstream", async (kind) => {
    const state = createKakaoState("/events/1");
    const response = await GET(request(`state=${state}&code=c`, kind === "mismatch" ? "other" : undefined));
    expect(location(response).pathname).toBe("/login");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.exchange).not.toHaveBeenCalled();
    expect(mocks.post).not.toHaveBeenCalled();
  });
  it("handles cancellation with a fixed message and preserves the destination", async () => {
    const state = createKakaoState("/events/1");
    const response = await GET(request(`state=${state}&error=access_denied&error_description=untrusted-message`, state));
    expect(location(response).searchParams.get("error")).toBe("카카오 로그인이 취소되었어요.");
    expect(location(response).searchParams.get("returnTo")).toBe("/events/1");
    expect(mocks.exchange).not.toHaveBeenCalled();
  });
  it("exchanges once, creates a session, clears state and redirects", async () => {
    const state = createKakaoState("/events/1");
    const response = await GET(request(`state=${state}&code=c`, state));
    expect(response.status).toBe(307);
    expect(location(response).href).toBe("https://club.test/events/1");
    expect(mocks.exchange).toHaveBeenCalledWith("c", "https://club.test");
    expect(mocks.post).toHaveBeenCalledWith("/v1/auth/kakao", { accessToken: "ka", clientType: "WEB", termsAccepted: true, privacyAccepted: true });
    expect(mocks.set).toHaveBeenCalledWith(response, session);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("sends a new Kakao member without email to onboarding", async () => {
    mocks.post.mockResolvedValue({ user: { ...session.user, onboardingCompletedAt: null } });
    const state = createKakaoState("/events/1");
    expect(location(await GET(request(`state=${state}&code=c`, state))).pathname).toBe("/onboarding");
  });
  it("rejects ambiguous codes before exchanging", async () => {
    const state = createKakaoState("/");
    expect(location(await GET(request(`state=${state}&code=c&code=other`, state))).pathname).toBe("/login");
    expect(mocks.exchange).not.toHaveBeenCalled();
  });
  it("handles upstream failure without exposing its message", async () => {
    mocks.exchange.mockRejectedValue(new Error("secret-provider-detail"));
    const state = createKakaoState("/events/1");
    const response = await GET(request(`state=${state}&code=c`, state));
    expect(location(response).searchParams.get("error")).not.toContain("secret-provider-detail");
    expect(location(response).searchParams.get("returnTo")).toBe("/events/1");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
