import type { Route } from "next";

const NOTIFICATION_LINK_BASE = "https://senior-club.invalid";
const MAX_LINK_LENGTH = 512;
const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$/;

type ExactRoutePolicy = {
  allowedParameters: readonly string[];
  requiredParameters?: readonly string[];
};

const EXACT_ROUTE_POLICIES: Readonly<Record<string, ExactRoutePolicy>> =
  Object.freeze({
    "/": { allowedParameters: [] },
    "/events": { allowedParameters: [] },
    "/clubs": { allowedParameters: [] },
    "/chat": { allowedParameters: ["roomId"] },
    "/me": { allowedParameters: [] },
    "/notifications": { allowedParameters: [] },
    "/reviews/new": {
      allowedParameters: ["eventId"],
      requiredParameters: ["eventId"],
    },
  });

function hasUnsafePathSegment(candidate: string) {
  const pathname = candidate.split(/[?#]/, 1)[0];

  for (const rawSegment of pathname.split("/")) {
    let segment = rawSegment;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let decoded: string;
      try {
        decoded = decodeURIComponent(segment);
      } catch {
        return true;
      }

      if (
        decoded === "." ||
        decoded === ".." ||
        /[\u0000-\u001f\u007f\\/]/.test(decoded)
      ) {
        return true;
      }
      if (decoded === segment) break;
      segment = decoded;
    }
  }

  return false;
}

function hasOnlyAllowedParameters(url: URL, policy: ExactRoutePolicy) {
  const seen = new Set<string>();

  for (const key of url.searchParams.keys()) {
    if (!policy.allowedParameters.includes(key) || seen.has(key)) return false;
    seen.add(key);
  }

  for (const key of policy.allowedParameters) {
    const value = url.searchParams.get(key);
    if (value !== null && !SAFE_SEGMENT.test(value)) return false;
  }

  return (policy.requiredParameters ?? []).every((key) => seen.has(key));
}

function canonicalize(url: URL, policy: ExactRoutePolicy) {
  const searchParams = new URLSearchParams();
  for (const key of policy.allowedParameters) {
    const value = url.searchParams.get(key);
    if (value !== null) searchParams.set(key, value);
  }
  const query = searchParams.toString();
  return `${url.pathname}${query ? `?${query}` : ""}` as Route;
}

/** Resolves an untrusted API notification link to a route that exists in this web app. */
export function resolveNotificationHref(value: unknown): Route | null {
  if (typeof value !== "string") return null;

  const candidate = value.trim();
  if (
    !candidate ||
    candidate !== value ||
    candidate.length > MAX_LINK_LENGTH ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(candidate) ||
    hasUnsafePathSegment(candidate)
  ) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(candidate, NOTIFICATION_LINK_BASE);
  } catch {
    return null;
  }

  if (url.origin !== NOTIFICATION_LINK_BASE || url.hash) return null;

  if (url.pathname === "/home" && !url.search) return "/";

  const exactPolicy = EXACT_ROUTE_POLICIES[url.pathname];
  if (exactPolicy) {
    return hasOnlyAllowedParameters(url, exactPolicy)
      ? canonicalize(url, exactPolicy)
      : null;
  }

  const eventMatch = url.pathname.match(/^\/events\/([^/]+)$/);
  if (eventMatch) {
    return SAFE_SEGMENT.test(eventMatch[1]) && !url.search
      ? (url.pathname as Route)
      : null;
  }

  const clubMatch = url.pathname.match(/^\/clubs\/([^/]+)$/);
  if (clubMatch) {
    return SAFE_SEGMENT.test(clubMatch[1]) && !url.search
      ? (url.pathname as Route)
      : null;
  }

  const clubPostsMatch = url.pathname.match(/^\/clubs\/([^/]+)\/posts$/);
  if (clubPostsMatch) {
    return SAFE_SEGMENT.test(clubPostsMatch[1]) && !url.search
      ? (url.pathname as Route)
      : null;
  }

  const legacyChatMatch = url.pathname.match(/^\/chat\/([^/]+)$/);
  if (
    legacyChatMatch &&
    SAFE_SEGMENT.test(legacyChatMatch[1]) &&
    !url.search
  ) {
    return `/chat?roomId=${encodeURIComponent(legacyChatMatch[1])}` as Route;
  }

  return null;
}
