import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { ACCESS_TOKEN_COOKIE_NAME, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { config, proxy } from "@/proxy";

const origin = "https://seniorclub.example";

function request(pathname: string, cookie?: string) {
  return new NextRequest(`${origin}${pathname}`, {
    headers: cookie ? { cookie } : undefined,
  });
}

describe("private route proxy", () => {
  it("redirects an anonymous request to login with a same-origin returnTo", () => {
    const response = proxy(request("/me?tab=events"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      `${origin}/login?returnTo=%2Fme%3Ftab%3Devents`,
    );
  });

  it("refreshes a valid session before rendering a private route", () => {
    const refreshToken = "r".repeat(64);
    const response = proxy(
      request("/notifications", `${SESSION_COOKIE_NAME}=${refreshToken}`),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      `${origin}/api/auth/continue?returnTo=%2Fnotifications`,
    );
  });

  it("allows a well-formed access token to reach authoritative validation", () => {
    const accessToken = "a".repeat(96);
    const response = proxy(
      request("/chat", `${ACCESS_TOKEN_COOKIE_NAME}=${accessToken}`),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("covers every private application area", () => {
    expect(config.matcher).toEqual([
      "/me/:path*",
      "/chat/:path*",
      "/notifications/:path*",
      "/reviews/:path*",
      "/onboarding/:path*",
      "/leader/:path*",
      "/admin/:path*",
    ]);
  });
});
