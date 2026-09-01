export const SESSION_COOKIE_NAME = "__Host-senior_club_session";
export const ACCESS_TOKEN_COOKIE_NAME = "__Host-senior_club_access";

export const SESSION_COOKIE_OPTIONS = Object.freeze({
  httpOnly: true,
  path: "/",
  sameSite: "lax" as const,
  secure: true,
});

const MAX_COOKIE_HEADER_LENGTH = 8_192;
const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,512}$/;
const ACCESS_TOKEN_PATTERN = /^[A-Za-z0-9._~-]{64,4096}$/;

export type SessionCookieInvalidReason =
  | "header-too-large"
  | "malformed"
  | "duplicate"
  | "invalid-token";

export type SessionCookieResult =
  | { status: "missing" }
  | { status: "invalid"; reason: SessionCookieInvalidReason }
  | { status: "valid"; token: string };

/**
 * Parses the raw Cookie header so duplicate session cookies are detectable.
 * Ambiguous or malformed values fail closed instead of selecting one value.
 */
export function inspectSessionCookieHeader(
  cookieHeader: string | null | undefined,
): SessionCookieResult {
  if (!cookieHeader) return { status: "missing" };
  if (cookieHeader.length > MAX_COOKIE_HEADER_LENGTH) {
    return { status: "invalid", reason: "header-too-large" };
  }

  const values: string[] = [];
  for (const segment of cookieHeader.split(";")) {
    const separator = segment.indexOf("=");
    const name = (separator >= 0 ? segment.slice(0, separator) : segment).trim();
    if (name !== SESSION_COOKIE_NAME) continue;

    if (separator < 0) {
      return { status: "invalid", reason: "malformed" };
    }
    values.push(segment.slice(separator + 1).trim());
  }

  if (values.length === 0) return { status: "missing" };
  if (values.length > 1) {
    return { status: "invalid", reason: "duplicate" };
  }

  const token = values[0];
  if (!SESSION_TOKEN_PATTERN.test(token)) {
    return { status: "invalid", reason: "invalid-token" };
  }

  return { status: "valid", token };
}

export function extractSessionToken(
  cookieHeader: string | null | undefined,
) {
  const result = inspectSessionCookieHeader(cookieHeader);
  return result.status === "valid" ? result.token : null;
}

export function extractSessionTokenFromHeaders(
  headers: Pick<Headers, "get">,
) {
  return extractSessionToken(headers.get("cookie"));
}

export function extractSessionTokenFromRequest(
  request: Pick<Request, "headers">,
) {
  return extractSessionTokenFromHeaders(request.headers);
}

export function extractAccessToken(
  cookieHeader: string | null | undefined,
) {
  if (!cookieHeader || cookieHeader.length > MAX_COOKIE_HEADER_LENGTH) return null;
  const values: string[] = [];
  for (const segment of cookieHeader.split(";")) {
    const separator = segment.indexOf("=");
    if (separator < 0) continue;
    const name = segment.slice(0, separator).trim();
    if (name === ACCESS_TOKEN_COOKIE_NAME) {
      values.push(segment.slice(separator + 1).trim());
    }
  }
  if (values.length !== 1 || !ACCESS_TOKEN_PATTERN.test(values[0] ?? "")) {
    return null;
  }
  return values[0] ?? null;
}

export function extractAccessTokenFromRequest(
  request: Pick<Request, "headers">,
) {
  return extractAccessToken(request.headers.get("cookie"));
}
