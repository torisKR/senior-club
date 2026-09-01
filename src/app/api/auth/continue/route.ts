import { NextResponse } from "next/server";

import { ApiHttpError } from "@/lib/api";
import {
  clearSessionCookies,
  refreshBackendSession,
  setSessionCookies,
} from "@/lib/auth/bff";
import {
  resolveSameOriginReturnTo,
  sanitizeReturnTo,
} from "@/lib/auth/return-to";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const returnTo = sanitizeReturnTo(requestUrl.searchParams.get("returnTo"));

  try {
    const session = await refreshBackendSession(request);
    const response = NextResponse.redirect(
      resolveSameOriginReturnTo(request.url, returnTo),
    );
    setSessionCookies(response, session);
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    return response;
  } catch (error) {
    if (!(error instanceof ApiHttpError) || error.status !== 401) throw error;

    const login = resolveSameOriginReturnTo(request.url, "/login");
    login.searchParams.set("returnTo", returnTo);
    const response = NextResponse.redirect(login);
    clearSessionCookies(response);
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    return response;
  }
}
