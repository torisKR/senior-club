import { describe, expect, it } from "vitest";

import {
  createPrivateNoStoreHeaders,
  PRIVATE_NO_STORE_CACHE_CONTROL,
  privateJsonResponse,
} from "@/lib/api/private-response";

describe("private response cache policy", () => {
  it("overrides every shared-cache header and preserves unrelated headers", () => {
    const headers = createPrivateNoStoreHeaders({
      "Cache-Control": "public, s-maxage=86400",
      "CDN-Cache-Control": "public",
      "X-Request-Id": "req-1",
    });

    expect(headers.get("cache-control")).toBe(PRIVATE_NO_STORE_CACHE_CONTROL);
    expect(headers.get("cdn-cache-control")).toBe("no-store");
    expect(headers.get("surrogate-control")).toBe("no-store");
    expect(headers.get("pragma")).toBe("no-cache");
    expect(headers.get("expires")).toBe("0");
    expect(headers.get("x-request-id")).toBe("req-1");
  });

  it("merges Cookie and Authorization into an existing Vary header", () => {
    const headers = createPrivateNoStoreHeaders({ Vary: "Accept-Encoding, cookie" });
    expect(headers.get("vary")).toBe(
      "Accept-Encoding, Cookie, Authorization",
    );
  });

  it("creates a JSON response with status and no-store headers", async () => {
    const response = privateJsonResponse(
      { data: { name: "회원" } },
      { status: 201, headers: { "X-Request-Id": "req-2" } },
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("cache-control")).toBe(
      PRIVATE_NO_STORE_CACHE_CONTROL,
    );
    expect(response.headers.get("x-request-id")).toBe("req-2");
    await expect(response.json()).resolves.toEqual({ data: { name: "회원" } });
  });
});
