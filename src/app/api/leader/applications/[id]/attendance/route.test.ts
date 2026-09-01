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

import { PATCH } from "@/app/api/leader/applications/[id]/attendance/route";

function attendanceRequest(
  body: { attendance: string; reason?: string } = {
    attendance: "ATTENDED",
    reason: "현장 출석 확인",
  },
) {
  return new Request(
    "https://seniorclub.example/api/leader/applications/application-1/attendance",
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

describe("PATCH /api/leader/applications/:id/attendance", () => {
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

  it("checks same-origin and forwards the exact attendance update once", async () => {
    const input = { attendance: "NO_SHOW", reason: "현장 불참 확인" };
    const updated = {
      id: "application/1",
      attendance: "NO_SHOW",
      checkedInAt: "2026-07-30T02:00:00.000Z",
      updatedAt: "2026-07-30T02:00:00.000Z",
    };
    mocks.patch.mockResolvedValue(updated);
    const incoming = attendanceRequest(input);

    const response = await PATCH(incoming, {
      params: Promise.resolve({ id: "application/1" }),
    });

    expect(mocks.assertSameOrigin).toHaveBeenCalledWith(incoming);
    expect(mocks.patch).toHaveBeenCalledWith(
      "/v1/applications/application%2F1/attendance",
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
      PATCH(attendanceRequest(), {
        params: Promise.resolve({ id: "application-1" }),
      }),
    ).resolves.toBe(errorResponse);
    expect(mocks.patch).not.toHaveBeenCalled();
  });

  it.each([403, 409])("preserves an upstream %i response envelope", async (status) => {
    const upstream = new Error(`upstream ${status}`);
    const errorResponse = NextResponse.json(
      { error: { code: status === 403 ? "LEADER_SCOPE_REQUIRED" : "ATTENDANCE_NOT_OPEN" } },
      { status },
    );
    mocks.patch.mockRejectedValue(upstream);
    mocks.apiErrorResponse.mockReturnValue(errorResponse);

    const response = await PATCH(attendanceRequest(), {
      params: Promise.resolve({ id: "application-1" }),
    });

    expect(response).toBe(errorResponse);
    expect(mocks.apiErrorResponse).toHaveBeenCalledWith(upstream);
  });

  it("rotates refreshed authentication cookies", async () => {
    const refreshed = { accessToken: "new-access" };
    mocks.patch.mockResolvedValue({
      id: "application-1",
      attendance: "ATTENDED",
      checkedInAt: "2026-07-30T02:00:00.000Z",
      updatedAt: "2026-07-30T02:00:00.000Z",
    });
    mocks.withBackendAccess.mockImplementation(async (_request, operation) => ({
      result: await operation("new-access"),
      refreshed,
    }));

    const response = await PATCH(attendanceRequest(), {
      params: Promise.resolve({ id: "application-1" }),
    });

    expect(mocks.setSessionCookies).toHaveBeenCalledWith(response, refreshed);
  });
});
