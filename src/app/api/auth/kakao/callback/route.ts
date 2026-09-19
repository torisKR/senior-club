import { NextResponse } from "next/server";

import { backendApi, type BackendIssuedSession, setSessionCookies } from "@/lib/auth/bff";
import { exchangeKakaoCode, kakaoReturnTo } from "@/lib/auth/kakao";
import { postLoginRoute } from "@/lib/auth/post-login-route";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  const cookie = request.headers.get("cookie")?.match(/(?:^|; )kakao_oauth_state=([^;]+)/)?.[1];
  const fail = (message: string) => {
    const response = NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(message)}`, url));
    response.cookies.set("kakao_oauth_state", "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires: new Date(0) });
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    return response;
  };
  if (!state || !cookie || state !== cookie) return fail("카카오 로그인 요청이 만료되었어요. 다시 시도해 주세요.");
  let intent: { returnTo?: string; termsAccepted?: boolean; privacyAccepted?: boolean };
  try {
    const parsed: unknown = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object") throw new Error("invalid state");
    intent = parsed as typeof intent;
  } catch { return fail("카카오 로그인 요청을 확인할 수 없습니다."); }
  if (intent.termsAccepted !== true || intent.privacyAccepted !== true) return fail("이용약관과 개인정보 처리방침에 동의해 주세요.");
  if (url.searchParams.has("error")) return fail("카카오 로그인이 취소되었어요.");
  const code = url.searchParams.get("code");
  if (!code) return fail(url.searchParams.get("error_description") ?? "카카오 인증이 취소되었어요.");
  try {
    const { access_token: accessToken } = await exchangeKakaoCode(code, url.origin);
    const session = await backendApi().post<BackendIssuedSession, Record<string, unknown>>("/v1/auth/kakao", { accessToken, clientType: "WEB", termsAccepted: true, privacyAccepted: true });
    const response = NextResponse.redirect(new URL(postLoginRoute(kakaoReturnTo(intent.returnTo), session.user.onboardingCompletedAt), url));
    setSessionCookies(response, session);
    response.cookies.set("kakao_oauth_state", "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires: new Date(0) });
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    return response;
  } catch { return fail("카카오 로그인에 실패했어요. 잠시 후 다시 시도해 주세요."); }
}
