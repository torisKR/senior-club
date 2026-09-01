import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  apiErrorResponse: vi.fn(),
  authorizedHeaders: vi.fn(),
  get: vi.fn(),
  privateNextJson: vi.fn(),
  setSessionCookies: vi.fn(),
  withBackendAccess: vi.fn(),
}));

vi.mock("@/lib/auth/bff", () => ({
  apiErrorResponse: mocks.apiErrorResponse,
  authorizedHeaders: mocks.authorizedHeaders,
  backendApi: () => ({ get: mocks.get }),
  privateNextJson: mocks.privateNextJson,
  setSessionCookies: mocks.setSessionCookies,
  withBackendAccess: mocks.withBackendAccess,
}));

import { GET } from "@/app/api/admin/reports/route";

describe("GET /api/admin/reports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizedHeaders.mockReturnValue({ Authorization: "Bearer access" });
    mocks.privateNextJson.mockImplementation((value) => NextResponse.json(value));
    mocks.withBackendAccess.mockImplementation(async (_request, operation) => ({
      result: await operation("access"),
      refreshed: null,
    }));
  });

  it("forwards only the fixed private admin endpoint", async () => {
    mocks.get.mockResolvedValue([]);
    const request = new Request("https://seniorclub.example/api/admin/reports?ignored=true");
    const response = await GET(request);

    expect(mocks.get).toHaveBeenCalledWith("/v1/admin/reports", {
      cache: "no-store",
      headers: { Authorization: "Bearer access" },
    });
    expect(await response.json()).toEqual([]);
  });
});
