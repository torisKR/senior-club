import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  apiErrorResponse: vi.fn(),
  get: vi.fn(),
}));

vi.mock("@/lib/auth/bff", () => ({
  apiErrorResponse: mocks.apiErrorResponse,
  backendApi: () => ({ get: mocks.get }),
}));

import { GET } from "@/app/api/interests/route";

describe("GET /api/interests", () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.apiErrorResponse.mockReset();
  });

  it("forwards the public interest catalog with its long-lived cache policy", async () => {
    const catalog = {
      data: [{ id: "interest-1", slug: "hiking", name: "등산", icon: "🥾" }],
    };
    mocks.get.mockResolvedValue(catalog);

    const response = await GET();

    expect(mocks.get).toHaveBeenCalledWith("/v1/interests");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(catalog);
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
    );
  });

  it("uses the shared API error envelope when the upstream is unavailable", async () => {
    const upstreamError = new Error("offline");
    const errorResponse = Response.json(
      { error: { code: "UPSTREAM_UNAVAILABLE" } },
      { status: 502 },
    );
    mocks.get.mockRejectedValue(upstreamError);
    mocks.apiErrorResponse.mockReturnValue(errorResponse);

    await expect(GET()).resolves.toBe(errorResponse);
    expect(mocks.apiErrorResponse).toHaveBeenCalledWith(upstreamError);
  });
});
