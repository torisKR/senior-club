import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiHttpError } from "@/lib/api";

const mocks = vi.hoisted(() => ({
  clearSessionCookies: vi.fn(),
  refreshBackendSession: vi.fn(),
  setSessionCookies: vi.fn(),
}));

vi.mock("@/lib/auth/bff", () => ({
  clearSessionCookies: mocks.clearSessionCookies,
  refreshBackendSession: mocks.refreshBackendSession,
  setSessionCookies: mocks.setSessionCookies,
}));

import { GET } from "@/app/api/auth/continue/route";

const session = {
  accessToken: "access-token",
  accessTokenExpiresAt: "2030-01-01T00:00:00.000Z",
  refreshToken: "refresh-token",
  refreshTokenExpiresAt: "2030-02-01T00:00:00.000Z",
  sessionId: "session-1",
  user: {
    id: "user-1",
    email: "member@example.com",
    name: "김정희",
    role: "MEMBER" as const,
    onboardingCompletedAt: "2026-07-30T00:00:00.000Z",
  },
};

function request(returnTo: string) {
  const url = new URL("https://seniorclub.example/api/auth/continue");
  url.searchParams.set("returnTo", returnTo);
  return new Request(url);
}

describe("GET /api/auth/continue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.refreshBackendSession.mockResolvedValue(session);
  });

  it("preserves the returnTo pathname, query, and fragment after refresh", async () => {
    const response = await GET(
      request("/events/event-1?intent=apply#application"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://seniorclub.example/events/event-1?intent=apply#application",
    );
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(mocks.setSessionCookies).toHaveBeenCalledWith(response, session);
  });

  it("keeps the safe returnTo intact when an expired session goes to login", async () => {
    mocks.refreshBackendSession.mockRejectedValue(
      new ApiHttpError(401, "로그인이 필요합니다.", "AUTHENTICATION_REQUIRED"),
    );

    const response = await GET(
      request("/events/event-1?intent=apply#application"),
    );
    const location = new URL(response.headers.get("location")!);

    expect(location.origin).toBe("https://seniorclub.example");
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("returnTo")).toBe(
      "/events/event-1?intent=apply#application",
    );
    expect(mocks.clearSessionCookies).toHaveBeenCalledWith(response);
  });

  it.each([
    "https://evil.example/events",
    "//evil.example/events",
    "/%2F%2Fevil.example/events",
    "/%255c%255cevil.example/events",
  ])("fails closed for unsafe or encoded returnTo value %s", async (returnTo) => {
    const response = await GET(request(returnTo));

    expect(response.headers.get("location")).toBe(
      "https://seniorclub.example/",
    );
  });
});
