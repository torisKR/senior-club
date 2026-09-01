import { NextRequest, NextResponse } from "next/server";

import { sanitizeReturnTo } from "@/lib/auth/return-to";
import {
  extractAccessToken,
  inspectSessionCookieHeader,
} from "@/lib/auth/session";

function redirectUrl(request: NextRequest, pathname: string, returnTo: string) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  url.searchParams.set("returnTo", sanitizeReturnTo(returnTo));
  return url;
}

/**
 * Performs a cheap credential-shape check before private routes render.
 * The API remains authoritative: Server Components validate the access token
 * and role against `/v1/me` before returning private content.
 */
export function proxy(request: NextRequest) {
  const cookieHeader = request.headers.get("cookie");
  if (extractAccessToken(cookieHeader)) {
    return NextResponse.next();
  }

  const returnTo = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  const refreshSession = inspectSessionCookieHeader(cookieHeader);
  if (refreshSession.status === "valid") {
    return NextResponse.redirect(
      redirectUrl(request, "/api/auth/continue", returnTo),
    );
  }

  return NextResponse.redirect(redirectUrl(request, "/login", returnTo));
}

export const config = {
  matcher: [
    "/me/:path*",
    "/chat/:path*",
    "/notifications/:path*",
    "/reviews/:path*",
    "/onboarding/:path*",
    "/leader/:path*",
    "/admin/:path*",
  ],
};
