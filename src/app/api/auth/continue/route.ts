import { NextResponse } from "next/server";

import { continuationDestination } from "@/lib/auth/continue-destination";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const destination = new URL("/auth/continue", requestUrl.origin);
  destination.searchParams.set("returnTo", continuationDestination(requestUrl.searchParams.get("returnTo")));
  // Redirects and prefetches cannot rotate a token. The mounted continuation
  // participates in the browser's shared session request and cross-tab lock.
  const response = NextResponse.redirect(destination);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}
