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

import { PATCH } from "@/app/api/leader/applications/[id]/route";

function request(
  body: { status: string; reason?: string } = {
    status: "REJECTED",
    reason: "일정 확인이 필요합니다.",
  },
) {
  return new Request(
    "https://seniorclub.example/api/leader/applications/application-1",
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://seniorclub.example",
      },
      body: JSON.stringify(body),
    },
  );
}

describe("PATCH /api/leader/applications/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertSameOrigin.mockImplementation(() => undefined);
    mocks.authorizedHeaders.mockReturnValue({ Authorization: "Bearer access" });
    mocks.privateNextJson.mockImplementation((value) => NextResponse.json(value));
    mocks.withBackendAccess.mockImplementation(async (_request, operation) => ({
      result: await operation("access"),
      refreshed: null,
    }));
  });

  it("checks same-origin and forwards the exact decision once", async () => {
    const input = { status: "REJECTED", reason: "일정 확인이 필요합니다." };
    const updated = { id: "application/1", status: "REJECTED" };
    mocks.patch.mockResolvedValue(updated);
    const incoming = request(input);

    const response = await PATCH(incoming, {
      params: Promise.resolve({ id: "application/1" }),
    });

    expect(mocks.assertSameOrigin).toHaveBeenCalledWith(incoming);
    expect(mocks.patch).toHaveBeenCalledWith(
      "/v1/applications/application%2F1",
      input,
      { headers: { Authorization: "Bearer access" } },
    );
    expect(await response.json()).toEqual(updated);
  });

  it("does not reach the backend after an origin rejection", async () => {
    const error = new Error("invalid origin");
    const errorResponse = NextResponse.json(
      { error: { code: "INVALID_ORIGIN" } },
      { status: 403 },
    );
    mocks.assertSameOrigin.mockImplementation(() => {
      throw error;
    });
    mocks.apiErrorResponse.mockReturnValue(errorResponse);

    await expect(
      PATCH(request(), { params: Promise.resolve({ id: "application-1" }) }),
    ).resolves.toBe(errorResponse);
    expect(mocks.patch).not.toHaveBeenCalled();
  });

  it("rotates refreshed authentication cookies", async () => {
    const refreshed = { accessToken: "new-access" };
    mocks.patch.mockResolvedValue({ id: "application-1", status: "APPROVED" });
    mocks.withBackendAccess.mockImplementation(async (_request, operation) => ({
      result: await operation("new-access"),
      refreshed,
    }));

    const response = await PATCH(request({ status: "APPROVED" }), {
      params: Promise.resolve({ id: "application-1" }),
    });

    expect(mocks.setSessionCookies).toHaveBeenCalledWith(response, refreshed);
  });
});
