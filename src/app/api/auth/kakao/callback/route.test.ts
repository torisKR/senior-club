import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ exchange: vi.fn(), post: vi.fn(), set: vi.fn() }));
vi.mock("@/lib/auth/kakao", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/auth/kakao")>()), exchangeKakaoCode: mocks.exchange }));
vi.mock("@/lib/auth/bff", () => ({ backendApi: () => ({ post: mocks.post }), setSessionCookies: mocks.set }));
vi.mock("@/lib/auth/post-login-route", async (importOriginal) => await importOriginal());

import { GET } from "@/app/api/auth/kakao/callback/route";

const session = { accessToken: "a", accessTokenExpiresAt: "2030-01-01", refreshToken: "r", refreshTokenExpiresAt: "2030-02-01", sessionId: "s", user: { id: "u", email: "u@e.test", name: "User", role: "MEMBER" as const, onboardingCompletedAt: "2030-01-01" } };
function state(consent = true) { return Buffer.from(JSON.stringify({ returnTo: "/events/1", termsAccepted: consent, privacyAccepted: consent })).toString("base64url"); }
function request(query: string, cookie?: string) { return new Request(`https://club.test/api/auth/kakao/callback?${query}`, { headers: cookie ? { cookie: `kakao_oauth_state=${cookie}` } : {} }); }

describe("Kakao callback", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.exchange.mockResolvedValue({ access_token: "ka" }); mocks.post.mockResolvedValue(session); });
  it.each(["missing", "mismatch"])("rejects %s state", async (kind) => { const s = state(); const response = await GET(request(`state=${kind === "missing" ? "" : encodeURIComponent(s)}&code=c`, kind === "mismatch" ? "other" : undefined)); expect(response.headers.get("location")).toContain("/login?error="); expect(response.headers.get("cache-control")).toContain("no-store"); });
  it("rejects missing consent and provider cancellation", async () => { const s = state(false); expect((await GET(request(`state=${s}`, s))).headers.get("location")).toContain("/login?error="); const ok = state(); expect((await GET(request(`state=${ok}&error=access_denied&error_description=cancelled`, ok))).headers.get("location")).toContain(encodeURIComponent("카카오 로그인이 취소되었어요.")); });
  it("exchanges, creates session, clears state and redirects", async () => { const s = state(); const response = await GET(request(`state=${s}&code=c`, s)); expect(response.status).toBe(307); expect(response.headers.get("location")).toBe("https://club.test/events/1"); expect(mocks.exchange).toHaveBeenCalledWith("c", "https://club.test"); expect(mocks.set).toHaveBeenCalledWith(response, session); expect(response.headers.get("set-cookie")).toContain("kakao_oauth_state="); });
  it("handles token failure", async () => { mocks.exchange.mockRejectedValue(new Error("no")); const s = state(); expect((await GET(request(`state=${s}&code=c`, s))).headers.get("location")).toContain("/login?error="); });
});
