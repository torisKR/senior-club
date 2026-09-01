import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  apiErrorResponse: vi.fn(),
  assertSameOrigin: vi.fn(),
  authorizedHeaders: vi.fn(),
  patch: vi.fn(),
  privateNextJson: vi.fn(),
  setSessionCookies: vi.fn(),
  withBackendAccess: vi.fn(),
}));

vi.mock("@/lib/auth/bff", () => ({
  apiErrorResponse: mocks.apiErrorResponse,
  assertSameOrigin: mocks.assertSameOrigin,
  authorizedHeaders: mocks.authorizedHeaders,
  backendApi: () => ({ patch: mocks.patch }),
  privateNextJson: mocks.privateNextJson,
  setSessionCookies: mocks.setSessionCookies,
  withBackendAccess: mocks.withBackendAccess,
}));

import { PATCH } from "@/app/api/admin/reports/[id]/route";
import { parseReportResolution } from "@/lib/admin/report-resolution";

function request(body: unknown) {
  return new Request("https://seniorclub.example/api/admin/reports/report-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Origin: "https://seniorclub.example" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/admin/reports/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizedHeaders.mockReturnValue({ Authorization: "Bearer access" });
    mocks.privateNextJson.mockImplementation((value) => NextResponse.json(value));
    mocks.withBackendAccess.mockImplementation(async (_request, operation) => ({
      result: await operation("access"),
      refreshed: null,
    }));
  });

  it("allowlists the exact resolution contract", async () => {
    mocks.patch.mockResolvedValue({ id: "report-1", status: "RESOLVED" });
    const incoming = request({ status: "RESOLVED", resolutionNote: "  확인 완료  " });
    const response = await PATCH(incoming, { params: Promise.resolve({ id: "report-1" }) });

    expect(mocks.assertSameOrigin).toHaveBeenCalledWith(incoming);
    expect(mocks.patch).toHaveBeenCalledWith(
      "/v1/admin/reports/report-1",
      { status: "RESOLVED", resolutionNote: "확인 완료" },
      { headers: { Authorization: "Bearer access" } },
    );
    expect(await response.json()).toEqual({ id: "report-1", status: "RESOLVED" });
  });

  it("rejects unsafe IDs and unknown body fields before the backend", async () => {
    const errorResponse = NextResponse.json({ error: { code: "INVALID" } }, { status: 400 });
    mocks.apiErrorResponse.mockReturnValue(errorResponse);

    await expect(
      PATCH(request({ status: "RESOLVED" }), { params: Promise.resolve({ id: "../report" }) }),
    ).resolves.toBe(errorResponse);
    expect(() => parseReportResolution({ status: "RESOLVED", admin: true })).toThrow();
    expect(mocks.patch).not.toHaveBeenCalled();
  });
});
