import "server-only";
import { sanitizeReturnTo } from "@/lib/auth/return-to";

export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "";
export const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? "";

function credentials() {
  return {
    clientId: process.env.GOOGLE_CLIENT_ID ?? GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? GOOGLE_CLIENT_SECRET,
  };
}

export function googleRedirectUri(origin: string) {
  return process.env.GOOGLE_REDIRECT_URI ?? `${origin}/api/auth/google/callback`;
}

export function getGoogleAuthorizeUrl(redirectUri: string, state?: string): string {
  const { clientId } = credentials();
  if (!clientId) throw new Error("GOOGLE_CLIENT_ID is not configured");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "select_account");
  if (state) url.searchParams.set("state", state);
  return url.toString();
}

export const googleAuthorizeUrl = (input: { origin: string; state: string }) =>
  getGoogleAuthorizeUrl(googleRedirectUri(input.origin), input.state);

export function googleReturnTo(value: string | null | undefined) {
  return sanitizeReturnTo(value);
}

export async function exchangeGoogleCode(code: string, origin: string) {
  return exchangeGoogleCodeForToken(code, googleRedirectUri(origin));
}

export async function exchangeGoogleCodeForToken(
  code: string,
  redirectUri: string,
): Promise<{ id_token?: string; access_token: string }> {
  const { clientId, clientSecret } = credentials();
  if (!clientId || !clientSecret) throw new Error("Google OAuth is not configured");
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code,
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    redirect: "error",
    cache: "no-store",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
    body,
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error("Google authorization failed");
  const payload = (await response.json()) as { access_token?: unknown; id_token?: unknown };
  if (typeof payload.access_token !== "string" || !payload.access_token) {
    throw new Error("Google access token missing");
  }
  return {
    access_token: payload.access_token,
    ...(typeof payload.id_token === "string" && payload.id_token
      ? { id_token: payload.id_token }
      : {}),
  };
}
