import type { Route } from "next";

export const DEFAULT_RETURN_TO: Route = "/";

const RETURN_TO_BASE_URL = "https://senior-club.invalid";

function hasUnsafeDecodedReturnTo(value: string) {
  let decoded = value;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (
      !decoded.startsWith("/") ||
      decoded.startsWith("//") ||
      decoded.includes("\\") ||
      /[\u0000-\u001f\u007f]/.test(decoded)
    ) {
      return true;
    }

    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      return true;
    }
  }

  return (
    !decoded.startsWith("/") ||
    decoded.startsWith("//") ||
    decoded.includes("\\")
  );
}

/** Accepts only a same-origin path so authentication cannot become an open redirect. */
export function sanitizeReturnTo(
  value: string | null | undefined,
  fallback: string = DEFAULT_RETURN_TO,
): Route {
  const safeFallback: Route =
    fallback !== value && !hasUnsafeDecodedReturnTo(fallback)
      ? (fallback as Route)
      : DEFAULT_RETURN_TO;

  if (typeof value !== "string") return safeFallback;

  const candidate = value.trim();
  if (candidate !== value || hasUnsafeDecodedReturnTo(candidate)) {
    return safeFallback;
  }

  try {
    const parsed = new URL(candidate, RETURN_TO_BASE_URL);
    if (parsed.origin !== RETURN_TO_BASE_URL) return safeFallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}` as Route;
  } catch {
    return safeFallback;
  }
}

/** Resolves a sanitized return path against the current request origin. */
export function resolveSameOriginReturnTo(
  requestUrl: string | URL,
  value: string | null | undefined,
  fallback: string = DEFAULT_RETURN_TO,
) {
  const origin = new URL(requestUrl).origin;
  return new URL(sanitizeReturnTo(value, fallback), `${origin}/`);
}
