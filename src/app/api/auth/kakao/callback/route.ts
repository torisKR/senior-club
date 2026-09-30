import { NextResponse } from "next/server";

import { backendApi, type BackendIssuedSession, setSessionCookies } from "@/lib/auth/bff";
import { exchangeKakaoCode, kakaoReturnTo } from "@/lib/auth/kakao";
import { postLoginRoute } from "@/lib/auth/post-login-route";
import { kakaoStateCookieName, kakaoStateCookieOptions, readKakaoIntent } from "@/lib/auth/kakao-state";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const intent = readKakaoIntent(request);
  const fail = (message: string) => {
    const target = new URL("/login", url);
    target.searchParams.set("error", message);
    if (intent) target.searchParams.set("returnTo", intent.returnTo);
    const response = NextResponse.redirect(target);
    response.cookies.set(kakaoStateCookieName(), "", { ...kakaoStateCookieOptions(), maxAge: 0 });
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    return response;
  };
  if (!intent) return fail("카카오 로그인 요청이 만료되었어요. 다시 시도해 주세요.");
  if (url.searchParams.has("error")) return fail("카카오 로그인이 취소되었어요.");
  const code = url.searchParams.get("code");
  if (!code || url.searchParams.getAll("code").length !== 1) return fail("카카오 인증을 확인하지 못했어요. 다시 시도해 주세요.");
  try {
    const { access_token: accessToken } = await exchangeKakaoCode(code, url.origin);
    const session = await backendApi().post<BackendIssuedSession, Record<string, unknown>>("/v1/auth/kakao", { accessToken, clientType: "WEB", termsAccepted: true, privacyAccepted: true });
    const response = NextResponse.redirect(new URL(postLoginRoute(kakaoReturnTo(intent.returnTo), session.user.onboardingCompletedAt), url));
    setSessionCookies(response, session);
    response.cookies.set(kakaoStateCookieName(), "", { ...kakaoStateCookieOptions(), maxAge: 0 });
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    return response;
  } catch { return fail("카카오 로그인에 실패했어요. 잠시 후 다시 시도해 주세요."); }
}
