export const PRIVATE_NO_STORE_CACHE_CONTROL =
  "private, no-store, max-age=0, must-revalidate";

function mergeVary(headers: Headers, requiredValues: readonly string[]) {
  const current = headers.get("Vary");
  if (current?.trim() === "*") return;

  const values = new Map<string, string>();
  for (const value of current?.split(",") ?? []) {
    const trimmed = value.trim();
    if (trimmed) values.set(trimmed.toLocaleLowerCase("en-US"), trimmed);
  }
  for (const value of requiredValues) {
    values.set(value.toLocaleLowerCase("en-US"), value);
  }

  headers.set("Vary", [...values.values()].join(", "));
}

/** Returns headers that cannot be stored by a browser, CDN, or proxy cache. */
export function createPrivateNoStoreHeaders(initialHeaders?: HeadersInit) {
  const headers = new Headers(initialHeaders);
  headers.set("Cache-Control", PRIVATE_NO_STORE_CACHE_CONTROL);
  headers.set("CDN-Cache-Control", "no-store");
  headers.set("Surrogate-Control", "no-store");
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");
  mergeVary(headers, ["Cookie", "Authorization"]);
  return headers;
}

export function privateJsonResponse<T>(
  body: T,
  init: ResponseInit = {},
) {
  return Response.json(body, {
    ...init,
    headers: createPrivateNoStoreHeaders(init.headers),
  });
}
