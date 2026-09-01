declare const safeAppRouteBrand: unique symbol;

export type SafeAppRoute = string & { readonly [safeAppRouteBrand]: true };

export type AppRouteRejectionReason =
  | 'not-a-string'
  | 'too-long'
  | 'external-or-malformed'
  | 'unknown-route'
  | 'invalid-parameter';

export type AppRouteParseResult =
  | { ok: true; route: SafeAppRoute }
  | { ok: false; reason: AppRouteRejectionReason };

const MAX_ROUTE_LENGTH = 512;
const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$/;
const SAFE_ENTITY_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const SAFE_CLUB_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const BASE_URL = 'https://senior-club.invalid';

const EXACT_ROUTES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  '/home': [],
  '/clubs': [],
  '/events': [],
  '/chat': ['roomId'],
  '/me': [],
  '/notifications': [],
  '/reviews/new': ['eventId'],
});

export const DEFAULT_NOTIFICATION_ROUTE = '/notifications' as SafeAppRoute;

function reject(reason: AppRouteRejectionReason): AppRouteParseResult {
  return { ok: false, reason };
}

function hasOnlyAllowedParameters(url: URL, allowedParameters: readonly string[]) {
  const seen = new Set<string>();

  for (const key of url.searchParams.keys()) {
    if (!allowedParameters.includes(key) || seen.has(key)) {
      return false;
    }
    seen.add(key);
  }

  return allowedParameters.every((key) => {
    const value = url.searchParams.get(key);
    return value === null || SAFE_SEGMENT.test(value);
  });
}

function canonicalize(url: URL, allowedParameters: readonly string[]) {
  const query = new URLSearchParams();
  for (const key of allowedParameters) {
    const value = url.searchParams.get(key);
    if (value !== null) {
      query.set(key, value);
    }
  }

  const queryString = query.toString();
  return `${url.pathname}${queryString ? `?${queryString}` : ''}` as SafeAppRoute;
}

/** Validates untrusted push/deep-link destinations against routes that exist in the app. */
export function parseAppRoute(value: unknown): AppRouteParseResult {
  if (typeof value !== 'string') {
    return reject('not-a-string');
  }

  const candidate = value.trim();
  if (!candidate || candidate.length > MAX_ROUTE_LENGTH) {
    return reject('too-long');
  }

  const rawPath = candidate.split(/[?#]/, 1)[0].toLowerCase();
  if (
    !candidate.startsWith('/') ||
    candidate.startsWith('//') ||
    candidate.includes('\\') ||
    candidate.includes('\0') ||
    /[\u0000-\u001F\u007F]/.test(candidate) ||
    rawPath.includes('..') ||
    /%(?:00|2e|2f|5c)/i.test(rawPath)
  ) {
    return reject('external-or-malformed');
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate, BASE_URL);
  } catch {
    return reject('external-or-malformed');
  }

  if (parsed.origin !== BASE_URL || parsed.hash) {
    return reject('external-or-malformed');
  }

  const exactParameters = EXACT_ROUTES[parsed.pathname];
  if (exactParameters) {
    return hasOnlyAllowedParameters(parsed, exactParameters)
      ? { ok: true, route: canonicalize(parsed, exactParameters) }
      : reject('invalid-parameter');
  }

  const eventMatch = parsed.pathname.match(/^\/event\/([^/]+)$/);
  if (eventMatch) {
    return SAFE_SEGMENT.test(eventMatch[1]) && hasOnlyAllowedParameters(parsed, [])
      ? { ok: true, route: parsed.pathname as SafeAppRoute }
      : reject('invalid-parameter');
  }

  // The API and email links use the web canonical plural path. Convert only the
  // validated entity id to the route that exists in this native app.
  const apiEventMatch = parsed.pathname.match(/^\/events\/([^/]+)$/);
  if (apiEventMatch) {
    return SAFE_SEGMENT.test(apiEventMatch[1]) && hasOnlyAllowedParameters(parsed, [])
      ? { ok: true, route: `/event/${apiEventMatch[1]}` as SafeAppRoute }
      : reject('invalid-parameter');
  }

  const clubMatch = parsed.pathname.match(/^\/club\/([^/]+)$/);
  if (clubMatch) {
    return SAFE_SEGMENT.test(clubMatch[1]) && hasOnlyAllowedParameters(parsed, [])
      ? { ok: true, route: parsed.pathname as SafeAppRoute }
      : reject('invalid-parameter');
  }

  const apiClubMatch = parsed.pathname.match(/^\/clubs\/([^/]+)$/);
  if (apiClubMatch) {
    return SAFE_SEGMENT.test(apiClubMatch[1]) && hasOnlyAllowedParameters(parsed, [])
      ? { ok: true, route: `/club/${apiClubMatch[1]}` as SafeAppRoute }
      : reject('invalid-parameter');
  }

  const nativePostListMatch = parsed.pathname.match(/^\/club\/([^/]+)\/posts$/);
  if (nativePostListMatch) {
    return SAFE_CLUB_SLUG.test(nativePostListMatch[1]) &&
      nativePostListMatch[1].length <= 80 &&
      hasOnlyAllowedParameters(parsed, [])
      ? { ok: true, route: parsed.pathname as SafeAppRoute }
      : reject('invalid-parameter');
  }

  const nativePostDetailMatch = parsed.pathname.match(
    /^\/club\/([^/]+)\/post\/([^/]+)$/,
  );
  if (nativePostDetailMatch) {
    return SAFE_CLUB_SLUG.test(nativePostDetailMatch[1]) &&
      nativePostDetailMatch[1].length <= 80 &&
      SAFE_ENTITY_ID.test(nativePostDetailMatch[2]) &&
      hasOnlyAllowedParameters(parsed, [])
      ? { ok: true, route: parsed.pathname as SafeAppRoute }
      : reject('invalid-parameter');
  }

  const apiPostListMatch = parsed.pathname.match(/^\/clubs\/([^/]+)\/posts$/);
  if (apiPostListMatch) {
    return SAFE_CLUB_SLUG.test(apiPostListMatch[1]) &&
      apiPostListMatch[1].length <= 80 &&
      hasOnlyAllowedParameters(parsed, [])
      ? { ok: true, route: `/club/${apiPostListMatch[1]}/posts` as SafeAppRoute }
      : reject('invalid-parameter');
  }

  const apiPostDetailMatch = parsed.pathname.match(
    /^\/clubs\/([^/]+)\/posts\/([^/]+)$/,
  );
  if (apiPostDetailMatch) {
    return SAFE_CLUB_SLUG.test(apiPostDetailMatch[1]) &&
      apiPostDetailMatch[1].length <= 80 &&
      SAFE_ENTITY_ID.test(apiPostDetailMatch[2]) &&
      hasOnlyAllowedParameters(parsed, [])
      ? {
          ok: true,
          route: `/club/${apiPostDetailMatch[1]}/post/${apiPostDetailMatch[2]}` as SafeAppRoute,
        }
      : reject('invalid-parameter');
  }

  return reject('unknown-route');
}

export function sanitizeNotificationRoute(
  value: unknown,
  fallback: SafeAppRoute = DEFAULT_NOTIFICATION_ROUTE,
) {
  const parsed = parseAppRoute(value);
  return parsed.ok ? parsed.route : fallback;
}

/** Extracts only route fields from an untrusted FCM data payload. */
export function notificationRouteFromData(data: unknown): AppRouteParseResult {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return reject('not-a-string');
  }

  const payload = data as Record<string, unknown>;
  return parseAppRoute(payload.route ?? payload.targetPath);
}
