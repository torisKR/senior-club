import "server-only";
import { sanitizeReturnTo } from "@/lib/auth/return-to";

export const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY ?? "";
export const KAKAO_CLIENT_SECRET = process.env.KAKAO_CLIENT_SECRET ?? "";
function credentials() {
  return { clientId: process.env.KAKAO_REST_API_KEY ?? KAKAO_REST_API_KEY, clientSecret: process.env.KAKAO_CLIENT_SECRET ?? KAKAO_CLIENT_SECRET };
}

export function kakaoRedirectUri(origin: string) {
  return process.env.KAKAO_REDIRECT_URI ?? `${origin}/api/auth/kakao/callback`;
}

export function getKakaoAuthorizeUrl(redirectUri: string, state?: string): string {
  const { clientId } = credentials();
  if (!clientId) throw new Error("KAKAO_REST_API_KEY is not configured");
  const url = new URL("https://kauth.kakao.com/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  if (state) url.searchParams.set("state", state);
  return url.toString();
}

export const kakaoAuthorizeUrl = (input: { origin: string; state: string }) =>
  getKakaoAuthorizeUrl(kakaoRedirectUri(input.origin), input.state);

export function kakaoReturnTo(value: string | null | undefined) {
  return sanitizeReturnTo(value);
}

export async function exchangeKakaoCode(code: string, origin: string) {
  return exchangeKakaoCodeForToken(code, kakaoRedirectUri(origin));
}

export async function exchangeKakaoCodeForToken(code: string, redirectUri: string): Promise<{ access_token: string }> {
  const { clientId, clientSecret } = credentials();
  if (!clientId || !clientSecret) throw new Error("Kakao OAuth is not configured");
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code,
  });
  const response = await fetch("https://kauth.kakao.com/oauth/token", {
    method: "POST",
    redirect: "error",
    cache: "no-store",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
    body,
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error("Kakao authorization failed");
  const payload = (await response.json()) as { access_token?: unknown };
  if (typeof payload.access_token !== "string" || !payload.access_token) {
    throw new Error("Kakao access token missing");
  }
  return { access_token: payload.access_token };
}
