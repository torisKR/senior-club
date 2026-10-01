import { NextResponse } from "next/server";

import { kakaoAuthorizeUrl, kakaoRedirectUri, kakaoReturnTo } from "@/lib/auth/kakao";
import {
  createKakaoState,
  kakaoStateCookieName,
  kakaoStateCookieOptions,
  KAKAO_STATE_MAX_AGE_SECONDS,
} from "@/lib/auth/kakao-state";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const returnTo = kakaoReturnTo(url.searchParams.get("returnTo"));
  const fail = (message: string) => {
    const target = new URL("/login", url);
    target.searchParams.set("error", message);
    target.searchParams.set("returnTo", returnTo);
    const response = NextResponse.redirect(target);
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    response.cookies.set(kakaoStateCookieName(), "", { ...kakaoStateCookieOptions(), maxAge: 0 });
    return response;
  };
  if (url.searchParams.getAll("termsAccepted").length !== 1 ||
      url.searchParams.getAll("privacyAccepted").length !== 1 ||
      url.searchParams.get("termsAccepted") !== "1" ||
      url.searchParams.get("privacyAccepted") !== "1") {
    return fail("이용약관과 개인정보 처리방침에 동의해 주세요.");
  }
  try {
    // The provider callback and the host-only intent cookie must share an origin.
    // A production alias enters the configured callback host before setting state.
    const callbackOrigin = new URL(kakaoRedirectUri(url.origin)).origin;
    if (process.env.NODE_ENV === "production" && callbackOrigin !== url.origin) {
      const canonical = new URL("/api/auth/kakao/authorize", callbackOrigin);
      canonical.searchParams.set("returnTo", returnTo);
      canonical.searchParams.set("termsAccepted", "1");
      canonical.searchParams.set("privacyAccepted", "1");
      const response = NextResponse.redirect(canonical);
      response.headers.set("Cache-Control", "private, no-store, max-age=0");
      return response;
    }
    const state = createKakaoState(returnTo);
    const target = kakaoAuthorizeUrl({ origin: url.origin, state });
    const response = NextResponse.redirect(target);
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    response.cookies.set(kakaoStateCookieName(), state, { ...kakaoStateCookieOptions(), maxAge: KAKAO_STATE_MAX_AGE_SECONDS });
    return response;
  } catch {
    return fail("카카오 로그인을 사용할 수 없습니다.");
  }
}
