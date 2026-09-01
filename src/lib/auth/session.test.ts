import { describe, expect, it } from "vitest";

import {
  extractSessionToken,
  extractSessionTokenFromHeaders,
  inspectSessionCookieHeader,
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_OPTIONS,
} from "@/lib/auth/session";

const VALID_TOKEN = "0123456789abcdefghijklmnopqrstuvwxyz_ABCD";

describe("server session cookie", () => {
  it("uses host-only production-safe cookie attributes", () => {
    expect(SESSION_COOKIE_NAME.startsWith("__Host-")).toBe(true);
    expect(SESSION_COOKIE_OPTIONS).toEqual({
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: true,
    });
    expect("domain" in SESSION_COOKIE_OPTIONS).toBe(false);
  });

  it("extracts one valid opaque session token", () => {
    const cookieHeader = `theme=large; ${SESSION_COOKIE_NAME}=${VALID_TOKEN}; locale=ko`;
    expect(inspectSessionCookieHeader(cookieHeader)).toEqual({
      status: "valid",
      token: VALID_TOKEN,
    });
    expect(extractSessionToken(cookieHeader)).toBe(VALID_TOKEN);
    expect(
      extractSessionTokenFromHeaders(new Headers({ cookie: cookieHeader })),
    ).toBe(VALID_TOKEN);
  });

  it("fails closed for duplicate cookies", () => {
    const result = inspectSessionCookieHeader(
      `${SESSION_COOKIE_NAME}=${VALID_TOKEN}; ${SESSION_COOKIE_NAME}=${"x".repeat(40)}`,
    );
    expect(result).toEqual({ status: "invalid", reason: "duplicate" });
    expect(
      extractSessionToken(
        `${SESSION_COOKIE_NAME}=${VALID_TOKEN}; ${SESSION_COOKIE_NAME}=${"x".repeat(40)}`,
      ),
    ).toBeNull();
  });

  it.each([
    "short",
    `"${VALID_TOKEN}"`,
    `${VALID_TOKEN}%2Fsuffix`,
    `${VALID_TOKEN}.jwt-part`,
  ])("rejects ambiguous or weak token %s", (token) => {
    expect(inspectSessionCookieHeader(`${SESSION_COOKIE_NAME}=${token}`)).toEqual({
      status: "invalid",
      reason: "invalid-token",
    });
  });

  it("distinguishes missing, malformed, and oversized cookies", () => {
    expect(inspectSessionCookieHeader("theme=large")).toEqual({
      status: "missing",
    });
    expect(inspectSessionCookieHeader(SESSION_COOKIE_NAME)).toEqual({
      status: "invalid",
      reason: "malformed",
    });
    expect(
      inspectSessionCookieHeader(
        `${SESSION_COOKIE_NAME}=${VALID_TOKEN}; filler=${"x".repeat(8_192)}`,
      ),
    ).toEqual({ status: "invalid", reason: "header-too-large" });
  });
});
