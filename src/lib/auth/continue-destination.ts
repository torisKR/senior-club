import { sanitizeReturnTo } from "./return-to";

/** A session continuation must finish at content, not restart authentication. */
export function continuationDestination(value: string | null | undefined) {
  const destination = sanitizeReturnTo(value);
  let path = new URL(destination, "https://senior-club.invalid").pathname;
  for (let attempt = 0; attempt < 2; attempt++) path = decodeURIComponent(path);
  path = path.replace(/\/+$/, "") || "/";
  return path === "/login" || path === "/auth/continue" || path === "/api/auth" || path.startsWith("/api/auth/")
    ? sanitizeReturnTo("/")
    : destination;
}
