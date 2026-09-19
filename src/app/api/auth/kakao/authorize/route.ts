import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { kakaoAuthorizeUrl, kakaoReturnTo } from "@/lib/auth/kakao";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = Buffer.from(JSON.stringify({
    nonce: randomUUID(),
    returnTo: kakaoReturnTo(url.searchParams.get("returnTo")),
    termsAccepted: url.searchParams.get("termsAccepted") === "1",
    privacyAccepted: url.searchParams.get("privacyAccepted") === "1",
  })).toString("base64url");
  try {
    const target = kakaoAuthorizeUrl({ origin: url.origin, state });
    const response = NextResponse.redirect(target);
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    response.cookies.set("kakao_oauth_state", state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600 });
    return response;
  } catch {
    const response = NextResponse.redirect(new URL(`/login?error=${encodeURIComponent("카카오 로그인을 사용할 수 없습니다.")}`, url));
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    return response;
  }
}
