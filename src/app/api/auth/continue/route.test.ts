import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/auth/continue/route";

const outboundFetch = vi.fn();

function request(returnTo?: string, headers?: HeadersInit) {
  const url = new URL("https://seniorclub.example/api/auth/continue");
  if (returnTo !== undefined) url.searchParams.set("returnTo", returnTo);
  return new Request(url, { headers });
}

describe("GET /api/auth/continue", () => {
  beforeEach(() => {
    outboundFetch.mockReset();
    vi.stubGlobal("fetch", outboundFetch);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("preserves the original intent for the mounted browser continuation", async () => {
    const response = await GET(request("/events/event-1?intent=apply#application"));
    const location = new URL(response.headers.get("location")!);

    expect(response.status).toBe(307);
    expect(location.origin).toBe("https://seniorclub.example");
    expect(location.pathname).toBe("/auth/continue");
    expect(location.searchParams.get("returnTo")).toBe("/events/event-1?intent=apply#application");
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
  });

  it.each([
    undefined,
    "https://evil.example/events",
    "//evil.example/events",
    "/%2F%2Fevil.example/events",
    "/%255c%255cevil.example/events",
    "/login?returnTo=/me",
    "/auth/continue?returnTo=/me",
    "/api/auth/continue?returnTo=/me",
  ])("uses the home destination for invalid or recursive intent %s", async (returnTo) => {
    const response = await GET(request(returnTo));
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/auth/continue");
    expect(location.searchParams.get("returnTo")).toBe("/");
  });

  it.each([
    { cookie: "senior_access=expired; senior_session=refresh-only" },
    { cookie: "senior_access=current; senior_session=current" },
    { "next-router-prefetch": "1", "rsc": "1", cookie: "senior_session=refresh-only" },
    { "next-router-segment-prefetch": "/me", "rsc": "1" },
  ] as HeadersInit[])("never rotates or clears cookies during navigation or prefetch %#", async (headers) => {
    const response = await GET(request("/me", headers));
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(outboundFetch).not.toHaveBeenCalled();
    expect(new URL(response.headers.get("location")!).pathname).toBe("/auth/continue");
  });
});
