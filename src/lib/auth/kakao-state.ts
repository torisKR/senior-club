import { randomUUID } from "node:crypto";

import { sanitizeReturnTo } from "./return-to";

export const KAKAO_STATE_MAX_AGE_SECONDS = 600;
const MAX_STATE_LENGTH = 2_048;

export function kakaoStateCookieName() {
  return process.env.NODE_ENV === "production"
    ? "__Host-senior_club_kakao_state"
    : "kakao_oauth_state";
}

export function kakaoStateCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
}

export function createKakaoState(returnTo: string) {
  return Buffer.from(JSON.stringify({
    nonce: randomUUID(),
    issuedAt: Date.now(),
    returnTo: sanitizeReturnTo(returnTo),
    termsAccepted: true,
    privacyAccepted: true,
  })).toString("base64url");
}

/** Match one host-only intent cookie; reject duplicate, malformed or expired state. */
export function readKakaoIntent(request: Request) {
  const url = new URL(request.url);
  const states = url.searchParams.getAll("state");
  const cookieHeader = request.headers.get("cookie") ?? "";
  if (states.length !== 1 || cookieHeader.length > 8_192) return null;
  const state = states[0];
  if (!state || state.length > MAX_STATE_LENGTH || !/^[A-Za-z0-9_-]+$/.test(state)) return null;

  const cookies = cookieHeader.split(";").flatMap((segment) => {
    const separator = segment.indexOf("=");
    const name = segment.slice(0, separator < 0 ? undefined : separator).trim();
    return name === kakaoStateCookieName()
      ? [separator < 0 ? "" : segment.slice(separator + 1).trim()]
      : [];
  });
  if (cookies.length !== 1 || cookies[0] !== state) return null;

  try {
    const intent = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
    if (!intent || typeof intent !== "object" || Array.isArray(intent) ||
      typeof intent.nonce !== "string" || !/^[a-f0-9-]{36}$/.test(intent.nonce) ||
      typeof intent.issuedAt !== "number" || !Number.isSafeInteger(intent.issuedAt) ||
      intent.issuedAt > Date.now() || Date.now() - intent.issuedAt > KAKAO_STATE_MAX_AGE_SECONDS * 1_000 ||
      intent.termsAccepted !== true || intent.privacyAccepted !== true ||
      typeof intent.returnTo !== "string") return null;
    return { returnTo: sanitizeReturnTo(intent.returnTo) };
  } catch {
    return null;
  }
}
