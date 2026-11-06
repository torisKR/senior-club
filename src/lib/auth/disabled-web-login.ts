import { NextResponse } from "next/server";

import { sanitizeReturnTo } from "./return-to";

const message = "카카오 계정으로 로그인해 주세요.";
const headers = { "Cache-Control": "private, no-store, max-age=0" };

/** Retired web providers must never forward credentials to the backend. */
export function disabledWebLogin() {
  return NextResponse.json({ error: { code: "LOGIN_PROVIDER_DISABLED", message } }, { status: 410, headers });
}

export function disabledWebOAuth(request: Request) {
  const url = new URL(request.url);
  const target = new URL("/login", url);
  target.searchParams.set("error", message);
  target.searchParams.set("returnTo", sanitizeReturnTo(url.searchParams.get("returnTo")));
  const response = NextResponse.redirect(target, { headers });
  response.cookies.set("google_oauth_state", "", {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0,
  });
  return response;
}
